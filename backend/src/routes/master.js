const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { HttpError, handle, withTransaction, audit } = require('./_helper');

// ==========================================
// === PRODUCTS & WORK ORDERS ===============
// ==========================================
router.get('/products', handle(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT
            p.Id AS id,
            p.ProductCode AS code,
            p.ProductName AS name,
            f.FamilyCode AS family_code,
            COALESCE(json_agg(
                json_build_object(
                    'step', r.StepSequence,
                    'machine_id', r.MachineId,
                    'machine', m.MachineCode,
                    'cycle_time', r.CycleTimeMinutes
                ) ORDER BY r.StepSequence
            ) FILTER (WHERE r.Id IS NOT NULL), '[]') AS routing
        FROM Products p
        INNER JOIN ProductFamilies f ON f.Id = p.FamilyId
        LEFT JOIN RoutingSteps r ON r.ProductId = p.Id
        LEFT JOIN Machines m ON m.Id = r.MachineId
        GROUP BY p.Id, f.FamilyCode
        ORDER BY p.Id;
    `);
    res.json(rows);
}));

// create a work order from a product: operations are generated from its routing
router.post('/orders', handle(async (req, res) => {
    const { productId, quantity, priority = 1, releaseDate, dueDate } = req.body;
    if (!Number.isInteger(productId)) throw new HttpError(400, "productId is required");
    if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, "quantity must be a positive integer");
    if (![1, 2, 3].includes(priority)) throw new HttpError(400, "priority must be 1, 2 or 3");
    if (!releaseDate || isNaN(new Date(releaseDate))) throw new HttpError(400, "releaseDate is not a valid date");
    if (!dueDate || isNaN(new Date(dueDate))) throw new HttpError(400, "dueDate is not a valid date");
    if (new Date(dueDate) <= new Date(releaseDate)) throw new HttpError(400, "dueDate must be after releaseDate");
    const order = await withTransaction(async (client) => {
        const { rows: [created] } = await client.query(
            `INSERT INTO Orders (ProductId, Quantity, Priority, ReleaseDate, DueDate)
             VALUES ($1, $2, $3, $4, $5) RETURNING Id AS id, OrderCode AS code`,
            [productId, quantity, priority, releaseDate, dueDate]
        );
        const ops = await client.query(`
            INSERT INTO OrderOperations (OrderId, MachineId, StepSequence, ProcessingTimeMinutes)
            SELECT $1, r.MachineId, r.StepSequence, CEIL($2::int * r.CycleTimeMinutes)::INT
            FROM RoutingSteps r
            WHERE r.ProductId = $3
        `, [created.id, quantity, productId]);
        if (ops.rowCount === 0) throw new HttpError(400, "This product has no routing steps");
        return created;
    });
    res.status(201).json(order);
}));

// ==========================================
// === SETUP MATRIX =========================
// ==========================================
// machineId null = default for every machine, a machine row overrides the default
router.get('/setup-matrix', handle(async (req, res) => {
    const families = await pool.query('SELECT Id AS id, FamilyCode AS code, FamilyName AS name FROM ProductFamilies ORDER BY Id');
    const entries = await pool.query(`
        SELECT MachineId AS machine_id, FromFamilyId AS from_family_id, ToFamilyId AS to_family_id, SetupMinutes AS minutes
        FROM SetupMatrix
        ORDER BY MachineId NULLS FIRST, FromFamilyId, ToFamilyId
    `);
    res.json({ families: families.rows, entries: entries.rows });
}));

// create or update one cell of the matrix
router.put('/setup-matrix', handle(async (req, res) => {
    const { machineId = null, fromFamilyId, toFamilyId, minutes } = req.body;
    if (machineId !== null && !Number.isInteger(machineId)) throw new HttpError(400, "machineId must be an integer or null");
    if (!Number.isInteger(fromFamilyId) || !Number.isInteger(toFamilyId)) throw new HttpError(400, "fromFamilyId and toFamilyId are required");
    if (!Number.isInteger(minutes) || minutes < 0) throw new HttpError(400, "minutes must be an integer >= 0");
    await pool.query(`
        INSERT INTO SetupMatrix (MachineId, FromFamilyId, ToFamilyId, SetupMinutes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (COALESCE(MachineId, 0), FromFamilyId, ToFamilyId)
        DO UPDATE SET SetupMinutes = EXCLUDED.SetupMinutes
    `, [machineId, fromFamilyId, toFamilyId, minutes]);
    res.json({ success: true });
}));

// remove a machine-specific cell so that the machine falls back to the default value
router.delete('/setup-matrix', handle(async (req, res) => {
    const machineId = Number(req.query.machineId);
    const fromFamilyId = Number(req.query.fromFamilyId);
    const toFamilyId = Number(req.query.toFamilyId);
    if (![machineId, fromFamilyId, toFamilyId].every(Number.isInteger)) {
        throw new HttpError(400, "machineId, fromFamilyId and toFamilyId are required (default cells cannot be deleted)");
    }
    const del = await pool.query(
        'DELETE FROM SetupMatrix WHERE MachineId = $1 AND FromFamilyId = $2 AND ToFamilyId = $3',
        [machineId, fromFamilyId, toFamilyId]
    );
    if (del.rowCount === 0) throw new HttpError(404, "Setup cell not found");
    res.json({ success: true });
}));

// ==========================================
// === MACHINE DOWNTIMES & EFFICIENCY =======
// ==========================================
router.get('/downtimes', handle(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT d.Id AS id, d.MachineId AS machine_id, m.MachineCode AS machine_code,
               d.StartTime AS start_time, d.EndTime AS end_time, d.Type AS type, d.Description AS description
        FROM MachineDowntimes d JOIN Machines m ON m.Id = d.MachineId ORDER BY d.StartTime`);
    res.json(rows);
}));

router.post('/downtimes', handle(async (req, res) => {
    const { machineId, startTime, endTime, type = 'PM', description = null } = req.body;
    if (!Number.isInteger(machineId)) throw new HttpError(400, "machineId is required");
    if (!startTime || isNaN(new Date(startTime)) || !endTime || isNaN(new Date(endTime))) throw new HttpError(400, "startTime and endTime must be valid dates");
    const sDate = new Date(startTime), eDate = new Date(endTime);
    if (eDate <= sDate) {
        throw new HttpError(400, `endTime (${eDate.toLocaleString('vi-VN')}) must be after startTime (${sDate.toLocaleString('vi-VN')})`);
    }
    if (!['PM', 'BREAKDOWN'].includes(type)) throw new HttpError(400, "type must be 'PM' or 'BREAKDOWN'");
    const created = await withTransaction(async (client) => {
        const { rows: [row] } = await client.query(
            `INSERT INTO MachineDowntimes (MachineId, StartTime, EndTime, Type, Description)
             VALUES ($1, $2, $3, $4, $5) RETURNING Id AS id`,
            [machineId, sDate.toISOString(), eDate.toISOString(), type, description]);
        await audit(client, 'ADD_DOWNTIME', 'MachineDowntime', row.id, req.body);
        return row;
    });
    res.status(201).json(created);
}));

router.delete('/downtimes/:id', handle(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, "Invalid downtime id");
    await withTransaction(async (client) => {
        const del = await client.query('DELETE FROM MachineDowntimes WHERE Id = $1', [id]);
        if (del.rowCount === 0) throw new HttpError(404, "Downtime not found");
        await audit(client, 'DELETE_DOWNTIME', 'MachineDowntime', id, {});
    });
    res.json({ success: true });
}));

router.put('/machines/:id/rate', handle(async (req, res) => {
    const id = Number(req.params.id);
    const { rate } = req.body;
    if (!Number.isInteger(id)) throw new HttpError(400, "Invalid machine id");
    if (typeof rate !== 'number' || !(rate > 0) || rate > 1) throw new HttpError(400, "rate must be in (0, 1]");
    await withTransaction(async (client) => {
        const upd = await client.query('UPDATE Machines SET EfficiencyRate = $1 WHERE Id = $2', [rate, id]);
        if (upd.rowCount === 0) throw new HttpError(404, "Machine not found");
        await audit(client, 'UPDATE_MACHINE_RATE', 'Machine', id, { rate });
    });
    res.json({ success: true });
}));

module.exports = router;