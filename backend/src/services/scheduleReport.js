const MINUTE = 60000;

// KPIs that come straight from the engine's stats of one schedule
function kpisFromStats(stats, totalOrders) {
    const late = stats.LateOrders;
    return {
        totalOrders,
        lateOrders: late,
        onTimeOrders: totalOrders - late,
        onTimeRate: totalOrders > 0 ? (totalOrders - late) / totalOrders : 1,
        totalLateMinutes: stats.TotalTardiness,
        priorityPenalty: stats.PriorityPenalty,
        makespanMinutes: stats.Makespan,
        totalSetupMinutes: stats.TotalSetupMinutes
    };
}

// rows: operation rows from the DB (see server.js), tasks: schedule with real IDs and minutes since planStart
function buildReport({ rows, tasks, stats, baselines, planStart }) {
    const toMinute = (date) => Math.round((new Date(date) - planStart) / MINUTE);
    const toIso = (minute) => new Date(planStart.getTime() + minute * MINUTE).toISOString();

    const orderInfo = new Map();
    const machineInfo = new Map();
    for (const r of rows) {
        if (!orderInfo.has(r.order_id)) {
            orderInfo.set(r.order_id, {
                id: r.order_id,
                code: r.order_code,
                productCode: r.product_code,
                productName: r.product_name,
                quantity: r.quantity,
                priority: r.priority,
                releaseAt: new Date(r.release_date).toISOString(),
                dueAt: new Date(r.due_date).toISOString(),
                releaseMinute: Math.max(0, toMinute(r.release_date)), // same clamp as the engine input
                dueMinute: toMinute(r.due_date)
            });
        }
        if (!machineInfo.has(r.machine_id)) {
            machineInfo.set(r.machine_id, { id: r.machine_id, code: r.machine_code, name: r.machine_name });
        }
    }

    const data = tasks.map((t) => {
        const o = orderInfo.get(t.orderId);
        const m = machineInfo.get(t.machineId);
        return {
            ...t,
            orderCode: o.code,
            productCode: o.productCode,
            machineCode: m.code,
            machineName: m.name,
            startAt: toIso(t.startTime),
            endAt: toIso(t.endTime),
            setupStartAt: toIso(t.setupStart)
        };
    });

    // per order: completion, lateness and where it waited the longest
    const byOrder = new Map();
    for (const t of tasks) {
        if (!byOrder.has(t.orderId)) byOrder.set(t.orderId, []);
        byOrder.get(t.orderId).push(t);
    }

    const orders = [];
    for (const o of [...orderInfo.values()].sort((a, b) => a.id - b.id)) {
        const steps = (byOrder.get(o.id) || []).sort((a, b) => a.step - b.step);
        let readyAt = o.releaseMinute;
        let worstWait = null;
        for (const t of steps) {
            const wait = t.startTime - readyAt; // time between "ready to start" and the actual start (machine busy / changeover)
            if (wait > 0 && (!worstWait || wait > worstWait.minutes)) {
                worstWait = { step: t.step, machineId: t.machineId, machineCode: machineInfo.get(t.machineId).code, minutes: wait };
            }
            readyAt = t.endTime;
        }

        const completion = steps.length ? steps[steps.length - 1].endTime : 0;
        const lateMinutes = Math.max(0, completion - o.dueMinute);
        orders.push({
            id: o.id,
            code: o.code,
            productCode: o.productCode,
            productName: o.productName,
            quantity: o.quantity,
            priority: o.priority,
            releaseAt: o.releaseAt,
            dueAt: o.dueAt,
            startAt: steps.length ? toIso(steps[0].startTime) : null,
            completionAt: toIso(completion),
            lateMinutes,
            slackMinutes: o.dueMinute - completion, // negative = late
            status: lateMinutes > 0 ? 'late' : 'ok',
            worstWait
        });
    }

    // per machine utilization over the schedule horizon [0, makespan]
    const perMachine = new Map();
    for (const m of machineInfo.values()) perMachine.set(m.id, { machineId: m.id, code: m.code, name: m.name, busyMinutes: 0, setupMinutes: 0 });
    for (const t of tasks) {
        const m = perMachine.get(t.machineId);
        m.busyMinutes += t.endTime - t.startTime;
        m.setupMinutes += t.setupMinutes;
    }
    const horizon = stats.Makespan;
    const machineUtilization = [...perMachine.values()]
        .sort((a, b) => a.machineId - b.machineId)
        .map((m) => ({ ...m, utilization: horizon > 0 ? Math.min(1, (m.busyMinutes + m.setupMinutes) / horizon) : 0 }));

    const totalProcessing = machineUtilization.reduce((a, m) => a + m.busyMinutes, 0);
    const kpis = {
        ...kpisFromStats(stats, orders.length),
        makespanEndAt: toIso(stats.Makespan),
        setupShare: stats.TotalSetupMinutes + totalProcessing > 0
            ? stats.TotalSetupMinutes / (stats.TotalSetupMinutes + totalProcessing) : 0,
        averageUtilization: machineUtilization.length
            ? machineUtilization.reduce((a, m) => a + m.utilization, 0) / machineUtilization.length : 0,
        machineUtilization
    };

    // the engine and the per-order numbers must agree
    const lateFromOrders = orders.filter((o) => o.status === 'late').length;
    if (lateFromOrders !== stats.LateOrders) {
        console.warn(`KPI mismatch: engine says ${stats.LateOrders} late orders, orders list says ${lateFromOrders}`);
    }

    const baselineKpis = (baselines || []).map((b) => ({ name: b.Name, kpis: kpisFromStats(b.Stats, orders.length) }));

    return { data, orders, kpis, baselines: baselineKpis };
}

module.exports = { buildReport, kpisFromStats };