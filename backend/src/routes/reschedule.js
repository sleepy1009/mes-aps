const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const apsEngine = require('../../../aps-engine/build/Release/aps_engine.node');
const { buildReport } = require('../services/scheduleReport');
const { HttpError, handle, withTransaction, audit, toMinutes, ENGINE_DEFAULTS } = require('./_helper');

// ==========================================
// === REACTIVE RESCHEDULE ========
// ==========================================
// Snapshot T on the BASE run's timeline. Progress derived from the base run's own rows
// (plan-adherence): end <= T done, start <= T < end in progress, else not started.
// All arithmetic here lives on the MACHINE (effective) timeline: a running chunk's
// remaining work is eMin - T, exact for every efficiency rate.
// Locked decisions: resume (not repeat); in-progress on a healthy machine is immutable;
// resume after repair has no re-setup; due dates never move.
router.post('/schedule/reschedule', handle(async (req, res) => {
    const { baseRunId, now, breakdowns = [] } = req.body;
    if (!Number.isInteger(baseRunId)) throw new HttpError(400, "baseRunId is required");
    if (!now || isNaN(new Date(now))) throw new HttpError(400, "now is not a valid date");
    if (!Array.isArray(breakdowns)) throw new HttpError(400, "breakdowns must be an array");
    const repairOf = new Map();
    for (const b of breakdowns) {
        if (!Number.isInteger(b.machineId) || !Number.isInteger(b.repairMinutes) || b.repairMinutes < 1)
            throw new HttpError(400, `invalid breakdown: ${JSON.stringify(b)}`);
        if (repairOf.has(b.machineId)) throw new HttpError(400, `machine ${b.machineId} has two breakdowns in one request`);
        repairOf.set(b.machineId, b.repairMinutes);
    }
    const { rows: [base] } = await pool.query(
        "SELECT Id AS id, PlanStart AS plan_start FROM ScheduleRuns WHERE Id = $1 AND Result <> '{}'::jsonb", [baseRunId]);
    if (!base) throw new HttpError(404, "Base run not found");
    const planStart = new Date(base.plan_start);
    const T = toMinutes(now, planStart);
    if (T < 0) throw new HttpError(400, "now is before the base run planStart");

    const { rows: baseRows } = await pool.query(`
        SELECT s.OrderOperationId AS op_id, s.MachineId AS machine_id, s.TaskStatus AS status,
               s.StartTime AS s, s.EndTime AS e, s.SetupStartTime AS ss, s.SetupMinutes AS sm,
               op.OrderId AS order_id, op.StepSequence AS step, op.ProcessingTimeMinutes AS p
        FROM Schedules s JOIN OrderOperations op ON op.Id = s.OrderOperationId
        WHERE s.RunId = $1 ORDER BY s.StartTime`, [baseRunId]);
    if (baseRows.length === 0) throw new HttpError(400, "Base run has no tasks");
    const makespanBase = Math.max(...baseRows.map(r => toMinutes(r.e, planStart)));
    if (T >= makespanBase) throw new HttpError(400, "Nothing left to reschedule: the base plan is fully executed at now");

    // ---- derive per-operation state at T on the MACHINE (effective) timeline ----
    const opState = new Map();
    for (const r of baseRows) {
        const sMin = toMinutes(r.s, planStart), eMin = toMinutes(r.e, planStart);
        let st = opState.get(r.op_id);
        if (!st) {
            st = { order_id: r.order_id, step: r.step, hasPast: false, inProgress: null, notStarted: null, maxEnd: -1 };
            opState.set(r.op_id, st);
        }
        if (eMin <= T) st.hasPast = true;
        else if (sMin <= T && T < eMin) st.inProgress = { ...r, sMin, eMin };
        else {
            if (st.notStarted) throw new HttpError(500, `derivation bug: operation ${r.op_id} has two not-started rows`);
            st.notStarted = { sMin, eMin };
        }
        st.maxEnd = Math.max(st.maxEnd, eMin);
    }
    const doneSteps = new Map();
    const fixed = [];
    const timeOverride = new Map(); // op_id -> { time, machineMinutes }
    const historyRows = [];
    const lastOnMachine = new Map();
    for (const r of baseRows) {
        const eMin = toMinutes(r.e, planStart);
        if (eMin > T) continue;
        const cur = lastOnMachine.get(r.machine_id);
        if (!cur || eMin >= cur.end) lastOnMachine.set(r.machine_id, { order_id: r.order_id, end: eMin });
        historyRows.push({ op_id: r.op_id, machine_id: r.machine_id, ss: r.ss, sm: r.sm, s: r.s, e: r.e });
    }
    for (const [op_id, st] of opState) {
        if (st.maxEnd <= T) { doneSteps.set(st.order_id, (doneSteps.get(st.order_id) || 0) + 1); continue; }
        if (st.inProgress) {
            const m = st.inProgress.machine_id;
            const R = repairOf.get(m) || 0;
            const rem = st.inProgress.eMin - T; // machine minutes left; correct for any rate
            const startMin = T + R;             // healthy machine: R = 0, chunk keeps its original end
            fixed.push({ order_id: st.order_id, machine_id: m, step: st.step, start: startMin, end: startMin + rem, kind: R > 0 ? 1 : 0 });
            historyRows.push({ op_id, machine_id: m, ss: st.inProgress.ss, sm: st.inProgress.sm,
                               s: st.inProgress.s, e: new Date(planStart.getTime() + T * 60000) });
        } else if (st.hasPast && st.notStarted) {
            // interrupted earlier, resume chunk not started yet (T inside a repair window):
            // remaining machine minutes = chunk length; flag stops the engine scaling again
            timeOverride.set(op_id, { time: st.notStarted.eMin - st.notStarted.sMin, machineMinutes: true });
        }
        // else: untouched operation -> nominal time, engine scales by rate as usual
    }
    // prefix validation: done steps of an order must be 1..k, fixed step must be k+1
    const orderSteps = new Map();
    for (const [op_id, st] of opState) {
        if (!orderSteps.has(st.order_id)) orderSteps.set(st.order_id, new Set());
        orderSteps.get(st.order_id).add(st.step);
    }
    const fixedByOrder = new Map();
    for (const f of fixed) {
        if (fixedByOrder.has(f.order_id)) throw new HttpError(500, "derivation bug: two fixed chunks for one order");
        fixedByOrder.set(f.order_id, f);
    }
    const progressCtx = [];
    for (const [orderId, steps] of orderSteps) {
        const k = doneSteps.get(orderId) || 0;
        for (let s = 1; s <= k; s++) if (!steps.has(s)) throw new HttpError(500, `derivation bug: order ${orderId} done steps are not a prefix`);
        const f = fixedByOrder.get(orderId);
        if (f && f.step !== k + 1) throw new HttpError(500, `derivation bug: fixed step ${f.step} of order ${orderId} != done+1`);
        if (k > 0) progressCtx.push({ orderId, done: k });
    }

    // ---- windows: live downtimes after T + the new repair windows ----
    const nowIso = new Date(planStart.getTime() + T * 60000).toISOString();
    const { rows: downRows } = await pool.query(
        'SELECT MachineId AS mid, StartTime AS s, EndTime AS e, Type AS type FROM MachineDowntimes WHERE EndTime > $1', [nowIso]);
    const windowsReal = [];
    for (const d of downRows) {
        const eMin = toMinutes(d.e, planStart);
        if (eMin <= T) continue;
        windowsReal.push({ machine_id: d.mid, start: Math.max(T, toMinutes(d.s, planStart)), end: eMin, type: d.type === 'BREAKDOWN' ? 1 : 0 });
    }
    for (const [mid, R] of repairOf) windowsReal.push({ machine_id: mid, start: T, end: T + R, type: 1 });

    // ---- same mapping + engine config machinery as /run ----
    const { rows: operations } = await pool.query(`
        SELECT op.Id AS operation_id, o.Id AS order_id, o.OrderCode AS order_code, o.Quantity AS quantity,
               o.Priority AS priority, o.ReleaseDate AS release_date, o.DueDate AS due_date,
               p.ProductCode AS product_code, p.ProductName AS product_name, p.FamilyId AS family_id,
               m.Id AS machine_id, m.MachineCode AS machine_code, m.MachineName AS machine_name,
               op.StepSequence AS step, op.ProcessingTimeMinutes AS time
        FROM OrderOperations op
        INNER JOIN Orders o ON o.Id = op.OrderId
        INNER JOIN Products p ON p.Id = o.ProductId
        INNER JOIN Machines m ON m.Id = op.MachineId
        ORDER BY o.Id, op.StepSequence`);
    const orderToSeq = new Map(), seqToOrder = new Map(), machineToSeq = new Map(), seqToMachine = new Map();
    const familyToSeq = new Map(), operationMap = new Map();
    const familySeq = (id) => { if (!familyToSeq.has(id)) familyToSeq.set(id, familyToSeq.size); return familyToSeq.get(id); };
    const cppInputData = [];
    for (const row of operations) {
        if (!orderToSeq.has(row.order_id)) { const s = orderToSeq.size + 1; orderToSeq.set(row.order_id, s); seqToOrder.set(s, row.order_id); }
        if (!machineToSeq.has(row.machine_id)) { const s = machineToSeq.size + 1; machineToSeq.set(row.machine_id, s); seqToMachine.set(s, row.machine_id); }
        operationMap.set(`${row.order_id}_${row.step}`, row.operation_id);
        cppInputData.push({
            OrderId: orderToSeq.get(row.order_id), Priority: row.priority,
            MachineId: machineToSeq.get(row.machine_id), Step: row.step,
            Time: timeOverride.has(row.operation_id) ? timeOverride.get(row.operation_id).time : row.time,
            TimeIsMachineMinutes: (timeOverride.has(row.operation_id) && timeOverride.get(row.operation_id).machineMinutes) ? 1 : 0,
            FamilyId: familySeq(row.family_id),
            ReleaseMinutes: Math.max(0, toMinutes(row.release_date, planStart)),
            DueDateMinutes: toMinutes(row.due_date, planStart)
        });
    }
    const { rows: matrixRows } = await pool.query('SELECT MachineId AS machine_id, FromFamilyId AS from_id, ToFamilyId AS to_id, SetupMinutes AS minutes FROM SetupMatrix');
    const setupMatrix = [];
    for (const e of matrixRows) {
        let machine = -1;
        if (e.machine_id !== null) { if (!machineToSeq.has(e.machine_id)) continue; machine = machineToSeq.get(e.machine_id); }
        setupMatrix.push({ MachineId: machine, FromFamily: familySeq(e.from_id), ToFamily: familySeq(e.to_id), Minutes: e.minutes });
    }
    const { rows: machineRows } = await pool.query('SELECT Id AS id, EfficiencyRate AS rate FROM Machines');
    const efficiency = [];
    for (const m of machineRows) {
        if (!machineToSeq.has(m.id)) continue;
        if (Number(m.rate) !== 1) efficiency.push({ MachineId: machineToSeq.get(m.id), Rate: Number(m.rate) });
    }
    const body = req.body || {};
    const engineConfig = { ...ENGINE_DEFAULTS, SetupMatrix: setupMatrix, Efficiency: efficiency,
        Windows: windowsReal.filter(w => machineToSeq.has(w.machine_id)).map(w => ({
            MachineId: machineToSeq.get(w.machine_id), Start: w.start, End: w.end, Type: w.type })) };
    if (Number.isInteger(body.seed) && body.seed > 0) engineConfig.Seed = body.seed;
    engineConfig.Reschedule = {
        NowMinutes: T,
        FixedTasks: fixed.map(f => ({ OrderId: orderToSeq.get(f.order_id), MachineId: machineToSeq.get(f.machine_id), Step: f.step, Start: f.start, End: f.end, Kind: f.kind })),
        Progress: progressCtx.map(p => ({ OrderId: orderToSeq.get(p.orderId), DoneSteps: p.done })),
        LastOrder: [...lastOnMachine.entries()]
            .filter(([m]) => machineToSeq.has(m))
            .map(([m, v]) => ({ MachineId: machineToSeq.get(m), OrderId: orderToSeq.get(v.order_id) }))
            .filter(x => x.OrderId !== undefined)
    };

    let engineOut;
    try {
        engineOut = await apsEngine.runSchedule(cppInputData, engineConfig);
    } catch (engineError) {
        throw new HttpError(400, `Engine rejected the reschedule: ${engineError.message}`);
    }
    const toIso = (minutes) => new Date(planStart.getTime() + minutes * 60000).toISOString();
    const engineTasks = engineOut.Tasks.map(t => ({
        orderId: seqToOrder.get(t.OrderId), operationId: operationMap.get(`${seqToOrder.get(t.OrderId)}_${t.Step}`),
        machineId: seqToMachine.get(t.MachineId), step: t.Step,
        startTime: t.StartTime, endTime: t.EndTime, setupStart: t.SetupStart, setupMinutes: t.SetupMinutes, status: t.Status
    }));
    const opOrder = new Map(baseRows.map(r => [r.op_id, r.order_id]));
    const opStep = new Map(baseRows.map(r => [r.op_id, r.step]));
    const historyTasks = historyRows.map(r => ({
        orderId: opOrder.get(r.op_id), operationId: r.op_id, machineId: r.machine_id, step: opStep.get(r.op_id),
        startTime: toMinutes(r.s, planStart), endTime: toMinutes(r.e, planStart),
        setupStart: toMinutes(r.ss, planStart), setupMinutes: r.sm, status: 2
    }));
    const reportTasks = [...historyTasks, ...engineTasks];
    const report = buildReport({ rows: operations, tasks: reportTasks, stats: engineOut.Stats, baselines: engineOut.Baselines, planStart });
    // engine stats only see gene orders; patch KPIs to DB truth so the stored report is honest
    const lateOrders = report.orders.filter(o => o.status === 'late').length;
    const totalLate = report.orders.reduce((s, o) => s + o.lateMinutes, 0);
    const makespan = Math.max(0, ...reportTasks.map(t => t.endTime));
    report.kpis = { ...report.kpis,
        totalOrders: report.orders.length, lateOrders,
        onTimeOrders: report.orders.length - lateOrders,
        onTimeRate: report.orders.length ? (report.orders.length - lateOrders) / report.orders.length : 1,
        totalLateMinutes: totalLate, makespanMinutes: makespan, makespanEndAt: toIso(makespan) };

    const saved = await withTransaction(async (client) => {
        const { rows: [run] } = await client.query(
            "INSERT INTO ScheduleRuns (PlanStart, RunType, ParentRunId) VALUES ($1, 'RESCHEDULE', $2) RETURNING Id, CreatedAt",
            [planStart.toISOString(), baseRunId]);
        // a breakdown is a real machine state: it enters the downtime calendar
        for (const [mid, R] of repairOf) {
            await client.query(
                `INSERT INTO MachineDowntimes (MachineId, StartTime, EndTime, Type, Description)
                 VALUES ($1, $2, $3, 'BREAKDOWN', $4)`,
                [mid, nowIso, new Date(planStart.getTime() + (T + R) * 60000).toISOString(),
                 `auto: reschedule run ${run.id} (repair ${R} min)`]);
        }
        if (historyRows.length) {
            await client.query(`
                INSERT INTO Schedules (RunId, OrderOperationId, MachineId, SetupStartTime, SetupMinutes, StartTime, EndTime, TaskStatus)
                SELECT $1, t.op_id, t.machine_id, t.ss, t.sm, t.s, t.e, 2
                FROM unnest($2::int[], $3::int[], $4::timestamptz[], $5::int[], $6::timestamptz[], $7::timestamptz[])
                     AS t(op_id, machine_id, ss, sm, s, e)`,
                [run.id, historyRows.map(r => r.op_id), historyRows.map(r => r.machine_id),
                 historyRows.map(r => new Date(r.ss).toISOString()), historyRows.map(r => r.sm),
                 historyRows.map(r => new Date(r.s).toISOString()), historyRows.map(r => new Date(r.e).toISOString())]);
        }
        if (engineTasks.length) {
            await client.query(`
                INSERT INTO Schedules (RunId, OrderOperationId, MachineId, SetupStartTime, SetupMinutes, StartTime, EndTime, TaskStatus)
                SELECT $1, t.op_id, t.machine_id, t.ss, t.sm, t.s, t.e, t.status
                FROM unnest($2::int[], $3::int[], $4::timestamptz[], $5::int[], $6::timestamptz[], $7::timestamptz[], $8::int[])
                     AS t(op_id, machine_id, ss, sm, s, e, status)`,
                [run.id, engineTasks.map(t => t.operationId), engineTasks.map(t => t.machineId),
                 engineTasks.map(t => toIso(t.setupStart)), engineTasks.map(t => t.setupMinutes),
                 engineTasks.map(t => toIso(t.startTime)), engineTasks.map(t => toIso(t.endTime)),
                 engineTasks.map(t => t.status)]);
        }
        const payload = { runId: run.id, createdAt: run.createdat, planStart: planStart.toISOString(),
                          runType: 'RESCHEDULE', parentRunId: baseRunId, snapshotAt: nowIso, ...report };
        await client.query('UPDATE ScheduleRuns SET Result = $1 WHERE Id = $2', [JSON.stringify(payload), run.id]);
        await audit(client, 'RESCHEDULE', 'ScheduleRun', run.id, { baseRunId, snapshotAt: nowIso, breakdowns });
        await client.query('DELETE FROM ScheduleRuns WHERE Id NOT IN (SELECT Id FROM ScheduleRuns ORDER BY Id DESC LIMIT 20)');
        return payload;
    });
    const { rows: [baseK] } = await pool.query("SELECT Result->'kpis' AS kpis FROM ScheduleRuns WHERE Id = $1", [baseRunId]);
    res.json({ message: "Reschedule completed!", ...saved, parentKpis: baseK ? baseK.kpis : null });
}));

module.exports = router;