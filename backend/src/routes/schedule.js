const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const apsEngine = require('../../../aps-engine/build/Release/aps_engine.node'); // routes/ deeper
const { buildReport } = require('../services/scheduleReport');
const { HttpError, handle, withTransaction, audit, toMinutes, ENGINE_DEFAULTS, ENGINE_LIMITS, loadPreviousKpis } = require('./_helper');

// Engine timeline: minute 0 = planStart (default: earliest release date of all orders).
// Real DB IDs are mapped to 1..n for the C++ engine and mapped back after it returns.
router.post('/schedule/run', handle(async (req, res) => {
    const { rows: operations } = await pool.query(`
        SELECT
            op.Id AS operation_id,
            o.Id AS order_id,
            o.OrderCode AS order_code,
            o.Quantity AS quantity,
            o.Priority AS priority,
            o.ReleaseDate AS release_date,
            o.DueDate AS due_date,
            p.ProductCode AS product_code,
            p.ProductName AS product_name,
            p.FamilyId AS family_id,
            m.Id AS machine_id,
            m.MachineCode AS machine_code,
            m.MachineName AS machine_name,
            op.StepSequence AS step,
            op.ProcessingTimeMinutes AS time
        FROM OrderOperations op
        INNER JOIN Orders o ON o.Id = op.OrderId
        INNER JOIN Products p ON p.Id = o.ProductId
        INNER JOIN Machines m ON m.Id = op.MachineId
        ORDER BY o.Id, op.StepSequence;
    `);
    if (operations.length === 0) throw new HttpError(400, "No data available for scheduling!");

    let planStart;
    if (req.body && req.body.planStart) {
        planStart = new Date(req.body.planStart);
        if (isNaN(planStart)) throw new HttpError(400, "planStart is not a valid date");
    } else {
        planStart = new Date(Math.min(...operations.map(r => new Date(r.release_date).getTime())));
    }
    planStart.setSeconds(0, 0);

    const orderToSeq = new Map();   // real order ID -> C++ ID
    const seqToOrder = new Map();
    const machineToSeq = new Map(); // real machine ID -> C++ ID
    const seqToMachine = new Map();
    const familyToSeq = new Map();  // real family ID -> C++ family index (0-based)
    const operationMap = new Map(); // "realOrderId_step" -> real operation ID
    const cppInputData = [];
    const familySeq = (id) => {
        if (!familyToSeq.has(id)) familyToSeq.set(id, familyToSeq.size);
        return familyToSeq.get(id);
    };
    for (const row of operations) {
        if (!orderToSeq.has(row.order_id)) {
            const seq = orderToSeq.size + 1;
            orderToSeq.set(row.order_id, seq);
            seqToOrder.set(seq, row.order_id);
        }
        if (!machineToSeq.has(row.machine_id)) {
            const seq = machineToSeq.size + 1;
            machineToSeq.set(row.machine_id, seq);
            seqToMachine.set(seq, row.machine_id);
        }
        operationMap.set(`${row.order_id}_${row.step}`, row.operation_id);
        cppInputData.push({
            OrderId: orderToSeq.get(row.order_id),
            Priority: row.priority,
            MachineId: machineToSeq.get(row.machine_id),
            Step: row.step,
            Time: row.time,
            FamilyId: familySeq(row.family_id),
            ReleaseMinutes: Math.max(0, toMinutes(row.release_date, planStart)),
            DueDateMinutes: toMinutes(row.due_date, planStart) // may be negative if already overdue at planStart
        });
    }

    // setup matrix: machine-specific rows override the default rows (MachineId NULL -> -1 for the engine)
    const { rows: matrixRows } = await pool.query(`
        SELECT MachineId AS machine_id, FromFamilyId AS from_id, ToFamilyId AS to_id, SetupMinutes AS minutes
        FROM SetupMatrix
    `);
    const setupMatrix = [];
    for (const e of matrixRows) {
        let machine = -1;
        if (e.machine_id !== null) {
            if (!machineToSeq.has(e.machine_id)) continue; // machine without operations
            machine = machineToSeq.get(e.machine_id);
        }
        setupMatrix.push({ MachineId: machine, FromFamily: familySeq(e.from_id), ToFamily: familySeq(e.to_id), Minutes: e.minutes });
    }

    const body = req.body || {};
    const engineConfig = { ...ENGINE_DEFAULTS, SetupMatrix: setupMatrix };

    // machine efficiency + downtime windows, converted to engine timeline minutes
    const { rows: machineRows } = await pool.query('SELECT Id AS id, EfficiencyRate AS rate FROM Machines');
    const efficiency = [];
    for (const m of machineRows) {
        if (!machineToSeq.has(m.id)) continue;
        const rate = Number(m.rate);
        if (rate !== 1) efficiency.push({ MachineId: machineToSeq.get(m.id), Rate: rate });
    }
    const { rows: downRows } = await pool.query(
        'SELECT MachineId AS mid, StartTime AS s, EndTime AS e, Type AS type FROM MachineDowntimes WHERE EndTime > $1',
        [planStart.toISOString()]
    );
    const windows = [];
    for (const d of downRows) {
        if (!machineToSeq.has(d.mid)) continue;
        const endMin = toMinutes(d.e, planStart);
        if (endMin <= 0) continue; // window fully in the past
        windows.push({
            MachineId: machineToSeq.get(d.mid),
            Start: Math.max(0, toMinutes(d.s, planStart)),
            End: endMin,
            Type: d.type === 'BREAKDOWN' ? 1 : 0
        });
    }
    engineConfig.Windows = windows;
    engineConfig.Efficiency = efficiency;

    if (Number.isInteger(body.seed) && body.seed > 0) engineConfig.Seed = body.seed;
    for (const [key, engineKey, min, max] of ENGINE_LIMITS) {
        if (body[key] === undefined) continue;
        if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) {
            throw new HttpError(400, `${key} must be an integer between ${min} and ${max}`);
        }
        engineConfig[engineKey] = body[key];
    }

    console.time("C++ Engine Execution");
    let engineOut;
    try {
        engineOut = await apsEngine.runSchedule(cppInputData, engineConfig);
    } catch (engineError) {
        throw new HttpError(400, `Engine rejected the data: ${engineError.message}`);
    } finally {
        console.timeEnd("C++ Engine Execution");
    }

    const tasks = engineOut.Tasks.map(task => ({
        orderId: seqToOrder.get(task.OrderId),
        operationId: operationMap.get(`${seqToOrder.get(task.OrderId)}_${task.Step}`),
        machineId: seqToMachine.get(task.MachineId),
        step: task.Step,
        startTime: task.StartTime,
        endTime: task.EndTime,
        setupStart: task.SetupStart,
        setupMinutes: task.SetupMinutes,
        status: task.Status
    }));
    const report = buildReport({ rows: operations, tasks, stats: engineOut.Stats, baselines: engineOut.Baselines, planStart });
    const toIso = (minutes) => new Date(planStart.getTime() + minutes * 60000).toISOString();
    const previous = await loadPreviousKpis(null);

    const saved = await withTransaction(async (client) => {
        const { rows: [run] } = await client.query(
            'INSERT INTO ScheduleRuns (PlanStart) VALUES ($1) RETURNING Id, CreatedAt', [planStart.toISOString()]
        );
        await audit(client, 'RUN_SCHEDULE', 'ScheduleRun', run.id, {
            populationSize: engineConfig.PopulationSize,
            maxGenerations: engineConfig.MaxGenerations,
            seed: engineConfig.Seed || null,
            windows: windows.length
        });
        await client.query(`
            INSERT INTO Schedules (RunId, OrderOperationId, MachineId, SetupStartTime, SetupMinutes, StartTime, EndTime)
            SELECT $1, t.op_id, t.machine_id, t.setup_start, t.setup_minutes, t.start_time, t.end_time
            FROM unnest($2::int[], $3::int[], $4::timestamptz[], $5::int[], $6::timestamptz[], $7::timestamptz[])
                 AS t(op_id, machine_id, setup_start, setup_minutes, start_time, end_time)
        `, [
            run.id,
            tasks.map(s => s.operationId),
            tasks.map(s => s.machineId),
            tasks.map(s => toIso(s.setupStart)),
            tasks.map(s => s.setupMinutes),
            tasks.map(s => toIso(s.startTime)),
            tasks.map(s => toIso(s.endTime))
        ]);
        // the report is stored so that the UI can reopen the latest result and compare runs
        const payload = { runId: run.id, createdAt: run.createdat, planStart: planStart.toISOString(), ...report };
        await client.query('UPDATE ScheduleRuns SET Result = $1 WHERE Id = $2', [JSON.stringify(payload), run.id]);
        // keep only the 20 most recent runs
        await client.query('DELETE FROM ScheduleRuns WHERE Id NOT IN (SELECT Id FROM ScheduleRuns ORDER BY Id DESC LIMIT 20)');
        return payload;
    });
    res.json({ message: "Scheduling completed!", ...saved, previous });
}));

// reopen the latest result (the UI shows it on start instead of an empty screen)
router.get('/schedule/latest', handle(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT Id AS id, Result AS result
        FROM ScheduleRuns
        WHERE Result <> '{}'::jsonb
        ORDER BY Id DESC LIMIT 1
    `);
    if (rows.length === 0) return res.json({ empty: true });
    const previous = await loadPreviousKpis(rows[0].id);
    res.json({ empty: false, ...rows[0].result, previous });
}));

// run list for the compare panel and the reschedule panel
router.get('/runs', handle(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT Id AS id, PlanStart AS plan_start, CreatedAt AS created_at,
               RunType AS run_type, ParentRunId AS parent_run_id
        FROM ScheduleRuns WHERE Result <> '{}'::jsonb ORDER BY Id DESC LIMIT 20`);
    res.json(rows);
}));

// per-order end/tardiness delta between two runs
router.get('/schedule/compare', handle(async (req, res) => {
    const runA = Number(req.query.runA), runB = Number(req.query.runB);
    if (!Number.isInteger(runA) || !Number.isInteger(runB)) throw new HttpError(400, "runA and runB are required");
    const { rows } = await pool.query(`
        WITH per_order AS (
            SELECT s.RunId AS run_id, op.OrderId AS order_id, MAX(s.EndTime) AS end_time
            FROM Schedules s JOIN OrderOperations op ON op.Id = s.OrderOperationId
            WHERE s.RunId = ANY($1::int[]) GROUP BY s.RunId, op.OrderId
        )
        SELECT p.run_id, o.Id AS order_id, o.OrderCode AS code, o.DueDate AS due, p.end_time
        FROM per_order p JOIN Orders o ON o.Id = p.order_id ORDER BY o.Id`, [[runA, runB]]);
    const byOrder = new Map();
    for (const r of rows) {
        if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, { orderId: r.order_id, code: r.code, due: r.due });
        const entry = byOrder.get(r.order_id);
        const tard = Math.max(0, Math.round((new Date(r.end_time) - new Date(r.due)) / 60000));
        if (r.run_id === runA) entry.a = { end: r.end_time, tardiness: tard };
        else entry.b = { end: r.end_time, tardiness: tard };
    }
    const orders = [...byOrder.values()].map(o => {
        const delta = o.a && o.b ? Math.round((new Date(o.b.end) - new Date(o.a.end)) / 60000) : null;
        const status = !o.a || !o.b ? 'missing'
            : o.b.tardiness < o.a.tardiness ? 'improved'
            : o.b.tardiness > o.a.tardiness ? 'worsened'
            : delta === 0 ? 'same' : 'shifted';
        return { ...o, deltaEndMinutes: delta, status };
    });
    res.json({ runA, runB, orders });
}));

// KPIs recomputed straight from Schedules (independent cross-check of the stored report)
router.get('/runs/:id/kpis', handle(async (req, res) => {
    const runId = Number(req.params.id);
    if (!Number.isInteger(runId)) throw new HttpError(400, "Invalid run id");
    const { rows: runRows } = await pool.query('SELECT Id AS id, PlanStart AS plan_start FROM ScheduleRuns WHERE Id = $1', [runId]);
    if (runRows.length === 0) throw new HttpError(404, "Run not found");
    const planStart = new Date(runRows[0].plan_start);
    const minOf = (d) => Math.round((new Date(d) - planStart) / 60000);
    // history rows (TaskStatus 2) are pre-snapshot work: excluded from utilization, kept for order completion
    const { rows: tasks } = await pool.query(
        'SELECT MachineId AS machine_id, SetupStartTime AS setup_start, StartTime AS start_time, EndTime AS end_time, SetupMinutes AS setup_minutes FROM Schedules WHERE RunId = $1 AND TaskStatus <> 2', [runId]);

    if (tasks.length === 0) return res.json({ runId, makespan: 0, otd: 1, machines: [], orders: [] });
    const horizon = Math.max(...tasks.map(t => minOf(t.end_time)));
    const { rows: downs } = await pool.query(
        'SELECT MachineId AS machine_id, StartTime AS s, EndTime AS e FROM MachineDowntimes WHERE EndTime > $1 AND StartTime < $2',
        [planStart.toISOString(), new Date(planStart.getTime() + horizon * 60000).toISOString()]);
    const perMachine = new Map();
    for (const t of tasks) {
        const e = perMachine.get(t.machine_id) || { cutting: 0, setup: 0, booked: 0 };
        e.cutting += minOf(t.end_time) - minOf(t.start_time);      // spindle time only
        e.setup   += t.setup_minutes;
        e.booked  += minOf(t.end_time) - minOf(t.setup_start);     // includes wait-after-setup
        perMachine.set(t.machine_id, e);
    }
    const machines = [...perMachine.entries()].map(([id, e]) => {
        let unavail = 0;
        for (const d of downs) if (d.machine_id === id) unavail += Math.max(0, Math.min(minOf(d.e), horizon) - Math.max(minOf(d.s), 0));
        const available = horizon - unavail;
        const running = e.cutting + e.setup;
        return { machineId: id, cuttingMinutes: e.cutting, setupMinutes: e.setup, bookedMinutes: e.booked,
                 unavailableMinutes: unavail,
                 utilization: available > 0 ? +(running / available).toFixed(4) : null,          // true running
                 bookedUtilization: available > 0 ? +(e.booked / available).toFixed(4) : null }; // machine held for the order
    });

    const bottleneck = machines.reduce((a, b) => ((b.utilization ?? -1) > (a.utilization ?? -1) ? b : a), machines[0]);
    const { rows: orderRows } = await pool.query(`
        WITH per_order AS (
            SELECT op.OrderId AS order_id, MAX(s.EndTime) AS end_time
            FROM Schedules s JOIN OrderOperations op ON op.Id = s.OrderOperationId
            WHERE s.RunId = $1 GROUP BY op.OrderId
        )
        SELECT o.Id AS order_id, o.OrderCode AS code, o.DueDate AS due, p.end_time
        FROM per_order p JOIN Orders o ON o.Id = p.order_id ORDER BY o.Id`, [runId]);
    let lateOrders = 0, totalTardiness = 0;
    const orders = orderRows.map(o => {
        const tard = Math.max(0, minOf(o.end_time) - minOf(o.due));
        if (tard > 0) { lateOrders++; totalTardiness += tard; }
        return { orderId: o.order_id, code: o.code, endMinutes: minOf(o.end_time), tardiness: tard };
    });
    const totalRunning = machines.reduce((s, m) => s + m.cuttingMinutes + m.setupMinutes, 0);
    const totalSetup = machines.reduce((s, m) => s + m.setupMinutes, 0);
    const { rows: mRows } = await pool.query(
        'SELECT Id AS id, MachineCode AS code FROM Machines WHERE Id = ANY($1::int[])',
        [machines.map(m => m.machineId)]
    );
    const codeOf = new Map(mRows.map(r => [r.id, r.code]));
    machines.forEach(m => { m.code = codeOf.get(m.machineId) || ('M' + m.machineId); });
    res.json({
        runId, planStart: runRows[0].plan_start, makespan: horizon,
        lateOrders, totalTardiness,
        otd: +((orders.length - lateOrders) / orders.length).toFixed(4),
        setupRatio: totalRunning > 0 ? +(totalSetup / totalRunning).toFixed(4) : 0,
        bottleneckMachineId: bottleneck.machineId,
        bottleneckCode: codeOf.get(bottleneck.machineId) || null,
        machines, orders
    });
}));

// full stored report of one run (the reschedule panel previews from it)
router.get('/runs/:id/result', handle(async (req, res) => {
    const runId = Number(req.params.id);
    if (!Number.isInteger(runId)) throw new HttpError(400, "Invalid run id");
    const { rows } = await pool.query(
        "SELECT Result AS result FROM ScheduleRuns WHERE Id = $1 AND Result <> '{}'::jsonb", [runId]);
    if (rows.length === 0) throw new HttpError(404, "Run not found");
    res.json(rows[0].result);
}));

module.exports = router;