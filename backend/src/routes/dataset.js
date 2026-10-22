const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { HttpError, handle, withTransaction, audit } = require('./_helper');

// ==========================================
// === CSV / EXCEL IMPORT (planner file) ===
// ==========================================
// one row per operation; machines/products/families/orders are all derived from the file
router.post('/dataset/import-csv', handle(async (req, res) => {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, "rows must be a non-empty array");
    if (rows.length > 20000) throw new HttpError(400, "too many rows (max 20000)");

    const clean = rows.map((r, i) => {
        const at = `Row ${i + 2}: `; // row 1 = header in the planner's file
        const need = (k) => {
            const v = r[k];
            if (v === undefined || v === null || String(v).trim() === '') throw new HttpError(400, at + `missing column '${k}'`);
            return String(v).trim();
        };
        const orderCode = need('OrderCode'), productCode = need('ProductCode'), productName = need('ProductName');
        const familyCode = need('FamilyCode'), machineCode = need('MachineCode');
        const quantity = Number(need('Quantity')), priority = Number(need('Priority'));
        const step = Number(need('StepSequence')), cycle = Number(need('CycleTimeMinutes'));
        const release = new Date(need('ReleaseDate')), due = new Date(need('DueDate'));
        if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, at + "Quantity must be a positive integer");
        if (![1, 2, 3].includes(priority)) throw new HttpError(400, at + "Priority must be 1, 2 or 3");
        if (!Number.isInteger(step) || step < 1) throw new HttpError(400, at + "StepSequence must be an integer >= 1");
        if (!(cycle > 0)) throw new HttpError(400, at + "CycleTimeMinutes must be > 0");
        if (isNaN(release.getTime())) throw new HttpError(400, at + "ReleaseDate is not a valid date");
        if (isNaN(due.getTime())) throw new HttpError(400, at + "DueDate is not a valid date");
        if (due <= release) throw new HttpError(400, at + "DueDate must be after ReleaseDate");
        return { orderCode, productCode, productName, familyCode, machineCode, quantity, priority, step, cycle, release, due };
    });

    // cross-row consistency: same order => same header fields; same product => same routing
    const orders = new Map(), products = new Map(), routings = new Map();
    const machines = new Set(), families = new Set();
    for (const r of clean) {
        machines.add(r.machineCode);
        families.add(r.familyCode);
        const p = products.get(r.productCode);
        if (!p) products.set(r.productCode, { name: r.productName, familyCode: r.familyCode });
        else if (p.familyCode !== r.familyCode) throw new HttpError(400, `Product ${r.productCode}: conflicting FamilyCode in file`);
        let rt = routings.get(r.productCode);
        if (!rt) { rt = new Map(); routings.set(r.productCode, rt); }
        const prev = rt.get(r.step);
        if (!prev) rt.set(r.step, { machineCode: r.machineCode, cycle: r.cycle });
        else if (prev.machineCode !== r.machineCode || prev.cycle !== r.cycle)
            throw new HttpError(400, `Product ${r.productCode} step ${r.step}: conflicting routing in file`);
        const o = orders.get(r.orderCode);
        if (!o) orders.set(r.orderCode, { productCode: r.productCode, quantity: r.quantity, priority: r.priority, release: r.release, due: r.due, steps: new Set([r.step]) });
        else {
            if (o.productCode !== r.productCode || o.quantity !== r.quantity || o.priority !== r.priority ||
                o.release.getTime() !== r.release.getTime() || o.due.getTime() !== r.due.getTime())
                throw new HttpError(400, `Order ${r.orderCode}: conflicting header fields between its rows`);
            if (o.steps.has(r.step)) throw new HttpError(400, `Order ${r.orderCode}: duplicate step ${r.step}`);
            o.steps.add(r.step);
        }
    }
    for (const [code, o] of orders) {
        const n = o.steps.size;
        for (let s = 1; s <= n; s++) if (!o.steps.has(s)) throw new HttpError(400, `Order ${code}: steps must be 1..${n}, missing ${s}`);
        if (routings.get(o.productCode).size !== n) throw new HttpError(400, `Order ${code}: order steps (${n}) != product routing steps (${routings.get(o.productCode).size})`);
    }

    await withTransaction(async (client) => {
        // full factory reset: cascades also wipe MachineDowntimes; Machines reseed resets EfficiencyRate
        await client.query('TRUNCATE TABLE Schedules, ScheduleRuns, OrderOperations, Orders, RoutingSteps, SetupMatrix, Products, ProductFamilies, Machines RESTART IDENTITY CASCADE');
        await client.query('INSERT INTO Machines (MachineCode, MachineName) SELECT unnest($1::text[]), unnest($1::text[])', [[...machines]]);
        await client.query('INSERT INTO ProductFamilies (FamilyCode, FamilyName) SELECT unnest($1::text[]), unnest($1::text[])', [[...families]]);
        await client.query(`
            INSERT INTO SetupMatrix (MachineId, FromFamilyId, ToFamilyId, SetupMinutes)
            SELECT NULL, a.Id, b.Id, CASE WHEN a.Id = b.Id THEN 5 ELSE 20 END
            FROM ProductFamilies a CROSS JOIN ProductFamilies b`);
        await client.query(`
            INSERT INTO Products (ProductCode, ProductName, FamilyId)
            SELECT t.code, t.name, f.Id
            FROM unnest($1::text[], $2::text[], $3::text[]) AS t(code, name, family)
            JOIN ProductFamilies f ON f.FamilyCode = t.family`,
            [[...products.keys()], [...products.values()].map(p => p.name), [...products.values()].map(p => p.familyCode)]);
        const rProd = [], rStep = [], rMachine = [], rCycle = [];
        for (const [pCode, rt] of routings) for (const [step, v] of rt) {
            rProd.push(pCode); rStep.push(step); rMachine.push(v.machineCode); rCycle.push(v.cycle);
        }
        await client.query(`
            INSERT INTO RoutingSteps (ProductId, StepSequence, MachineId, CycleTimeMinutes)
            SELECT p.Id, t.step, m.Id, t.cycle
            FROM unnest($1::text[], $2::int[], $3::text[], $4::numeric[]) AS t(product, step, machine, cycle)
            JOIN Products p ON p.ProductCode = t.product
            JOIN Machines m ON m.MachineCode = t.machine`,
            [rProd, rStep, rMachine, rCycle]);
        const oCode = [], oProd = [], oQty = [], oPrio = [], oRel = [], oDue = [];
        for (const [code, o] of orders) {
            oCode.push(code); oProd.push(o.productCode); oQty.push(o.quantity);
            oPrio.push(o.priority); oRel.push(o.release.toISOString()); oDue.push(o.due.toISOString());
        }
        await client.query(`
            INSERT INTO Orders (OrderCode, ProductId, Quantity, Priority, ReleaseDate, DueDate)
            SELECT t.code, p.Id, t.qty, t.prio, t.rel, t.due
            FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::timestamptz[], $6::timestamptz[])
                 AS t(code, product, qty, prio, rel, due)
            JOIN Products p ON p.ProductCode = t.product`,
            [oCode, oProd, oQty, oPrio, oRel, oDue]);
        await client.query(`
            INSERT INTO OrderOperations (OrderId, MachineId, StepSequence, ProcessingTimeMinutes)
            SELECT o.Id, r.MachineId, r.StepSequence, CEIL(o.Quantity * r.CycleTimeMinutes)::INT
            FROM Orders o JOIN RoutingSteps r ON r.ProductId = o.ProductId`);
        await audit(client, 'IMPORT_CSV', 'Dataset', null, { rows: clean.length, orders: orders.size, machines: machines.size });
    });
    res.json({ message: `Imported ${orders.size} orders, ${products.size} products, ${machines.size} machines.` });
}));

// ==========================================
// === DATASET INFO & ORDER EDITING ========
// ==========================================
router.get('/dataset/info', handle(async (req, res) => {
    const mRes = await pool.query('SELECT Id AS id, MachineCode AS code, MachineName AS name, EfficiencyRate AS rate FROM Machines ORDER BY Id');
    const jRes = await pool.query(`
        SELECT
            o.Id AS id,
            o.OrderCode AS code,
            p.ProductCode AS product_code,
            p.ProductName AS product_name,
            f.FamilyCode AS family_code,
            o.Quantity AS quantity,
            o.Priority AS priority,
            o.ReleaseDate AS release_date,
            o.DueDate AS due_date,
            COALESCE(SUM(op.ProcessingTimeMinutes), 0)::INT AS pi_time,
            COALESCE(json_agg(
                json_build_object(
                    'step', op.StepSequence,
                    'machine', m.MachineCode,
                    'machine_id', op.MachineId,
                    'time', op.ProcessingTimeMinutes,
                    'cycle_time', r.CycleTimeMinutes
                ) ORDER BY op.StepSequence
            ) FILTER (WHERE op.Id IS NOT NULL), '[]') AS operations
        FROM Orders o
        INNER JOIN Products p ON p.Id = o.ProductId
        INNER JOIN ProductFamilies f ON f.Id = p.FamilyId
        LEFT JOIN OrderOperations op ON op.OrderId = o.Id
        LEFT JOIN RoutingSteps r ON r.ProductId = p.Id AND r.StepSequence = op.StepSequence
        LEFT JOIN Machines m ON m.Id = op.MachineId
        GROUP BY o.Id, p.ProductCode, p.ProductName, f.FamilyCode
        ORDER BY o.Id;
    `);
    
    res.json({
        numMachines: mRes.rows.length,
        machines: mRes.rows,
        numJobs: jRes.rows.length,
        jobs: jRes.rows
    });
}));

// update order info (priority, dates, quantity) and the processing time of its operations
router.put('/dataset/job/:id', handle(async (req, res) => {
    const jobId = Number(req.params.id);
    const { priority, due_date, release_date, quantity, operations } = req.body;
    if (!Number.isInteger(jobId)) throw new HttpError(400, "Invalid order id");
    if (![1, 2, 3].includes(priority)) throw new HttpError(400, "priority must be 1, 2 or 3");
    if (!due_date || isNaN(new Date(due_date))) throw new HttpError(400, "due_date is not a valid date");
    if (release_date && isNaN(new Date(release_date))) throw new HttpError(400, "release_date is not a valid date");
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) throw new HttpError(400, "quantity must be a positive integer");
    if (!Array.isArray(operations)) throw new HttpError(400, "operations must be an array");
    for (const op of operations) {
        if (!Number.isInteger(op.step) || !(op.time >= 1)) throw new HttpError(400, `Invalid operation: ${JSON.stringify(op)}`);
    }
    const { rows: [cur] } = await pool.query('SELECT ReleaseDate AS release_date FROM Orders WHERE Id = $1', [jobId]);
    if (!cur) throw new HttpError(404, "Order not found");
    const effRelease = release_date ? new Date(release_date) : new Date(cur.release_date);
    const effDue = new Date(due_date);
    if (effDue <= effRelease) {
        throw new HttpError(400,
            `DueDate (${effDue.toLocaleString('vi-VN')}) must be after ReleaseDate (${effRelease.toLocaleString('vi-VN')})`);
    }
    await withTransaction(async (client) => {
        const upd = await client.query(
            `UPDATE Orders SET Priority = $1, DueDate = $2,
                    ReleaseDate = COALESCE($3, ReleaseDate), Quantity = COALESCE($4, Quantity)
             WHERE Id = $5`,
            [priority, due_date, release_date || null, quantity ?? null, jobId]
        );
        if (upd.rowCount === 0) throw new HttpError(404, "Order not found");
        // quantity changed => snapshot recomputed from routing x quantity (ERP-correct)
        if (quantity !== undefined) {
            await client.query(
                `UPDATE OrderOperations op
                 SET ProcessingTimeMinutes = CEIL(o.Quantity * r.CycleTimeMinutes)::INT
                 FROM Orders o
                 JOIN RoutingSteps r ON r.ProductId = o.ProductId
                 WHERE op.OrderId = $1 AND o.Id = $1 AND r.StepSequence = op.StepSequence`, [jobId]);
        }
        // manual per-step overrides from the UI
        for (const op of operations) {
            await client.query(
                'UPDATE OrderOperations SET ProcessingTimeMinutes = $1 WHERE OrderId = $2 AND StepSequence = $3',
                [op.time, jobId, op.step]);
        }
        await audit(client, 'UPDATE_ORDER', 'Order', jobId, req.body);
    });
    res.json({ success: true, message: 'update successful!' });
}));

module.exports = router;