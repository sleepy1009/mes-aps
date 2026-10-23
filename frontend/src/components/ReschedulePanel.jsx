import React, { useEffect, useMemo, useState } from 'react';
import { fetchDatasetInfo, listRuns, fetchRunResult, reschedule } from '../services/api';
import { useToast } from '../ToastContext';

const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ReschedulePanel = ({ onRescheduled }) => {
    const [runs, setRuns] = useState([]);
    const [baseRunId, setBaseRunId] = useState('');
    const [base, setBase] = useState(null);
    const [machines, setMachines] = useState([]);
    const [now, setNow] = useState('');
    const [breakdowns, setBreakdowns] = useState([]);
    const [busy, setBusy] = useState(false);
    const toast = useToast();

    const loadRuns = () => listRuns().then(r => {
        setRuns(r);
        setBaseRunId(prev => prev || (r[0] ? String(r[0].id) : ''));
    });
    useEffect(() => {
        loadRuns();
        fetchDatasetInfo().then(i => setMachines(i.machines)).catch(() => {});
    }, []);
    useEffect(() => {
        if (!baseRunId) { setBase(null); return; }
        fetchRunResult(Number(baseRunId)).then(setBase).catch(() => setBase(null));
    }, [baseRunId]);

    const Tmin = useMemo(() => {
        if (!base || !now) return null;
        const d = new Date(now);
        if (isNaN(d)) return null;
        return Math.round((d - new Date(base.planStart)) / 60000);
    }, [base, now]);

    const preview = useMemo(() => {
        if (!base || Tmin === null) return null;
        const rows = (base.data || []).filter(t => (t.status || 0) !== 2);
        let done = 0;
        const list = [];
        for (const t of rows) {
            if (t.endTime <= Tmin) { done++; continue; }
            const running = t.startTime <= Tmin && Tmin < t.endTime;
            list.push({
                key: `${t.orderCode}_${t.step}`,
                orderCode: t.orderCode, step: t.step, machineCode: t.machineCode,
                state: running ? 'RUNNING' : 'TODO',
                remaining: running ? t.endTime - Tmin : t.endTime - t.startTime
            });
        }
        return { done, list };
    }, [base, Tmin]);

    const submit = async () => {
        if (!baseRunId || !now) { toast({ kind: 'error', message: 'Choose base run and time T.' }); return; }
        setBusy(true);
        try {
            const payload = await reschedule({
                baseRunId: Number(baseRunId),
                now: new Date(now).toISOString(),
                breakdowns: breakdowns.filter(b => b.machineId !== '')
                    .map(b => ({ machineId: Number(b.machineId), repairMinutes: Number(b.repairMinutes) }))
            });
            toast({ kind: 'success', message: `Run #${payload.runId} created (RESCHEDULE of #${baseRunId}).` });
            await loadRuns();
            if (onRescheduled) onRescheduled(payload);
        } catch (e) {
            toast({ kind: 'error', message: e.response?.data?.message || e.message });
        } finally { setBusy(false); }
    };

    const patchBreakdown = (i, patch) =>
        setBreakdowns(breakdowns.map((x, j) => (j === i ? { ...x, ...patch } : x)));

    return (
        <div className="panel-root">
            <div className="panel-toolbar">
                <select className="select select-rich" value={baseRunId} title="Base run"
                    onChange={e => setBaseRunId(e.target.value)}>
                    {runs.map(r => (
                        <option key={r.id} value={r.id}>
                            Run #{r.id} {r.run_type === 'RESCHEDULE' ? `(RESCHEDULE ← #${r.parent_run_id})` : '(PLAN)'}
                        </option>
                    ))}
                </select>
                <button className="btn btn-primary" onClick={submit} disabled={busy}
                    title="Re-optimize the remaining steps from time T">
                    {busy ? 'Processing…' : 'Reschedule at T'}
                </button>
            </div>

            <div className="form-stack">
                <div className="field-row">
                    <span className="field-label" title="Snapshot time T of the shop floor.">Time T</span>
                    <div className="input-group">
                        <input type="datetime-local" className="input" value={now}
                            onChange={e => setNow(e.target.value)} />
                        <button className="btn btn-ghost" title="Set T to the start of the base plan"
                            onClick={() => setNow(base ? toLocalInput(base.planStart) : now)}>
                            T = plan start
                        </button>
                    </div>
                </div>

                <div className="field-row is-top">
                    <span className="field-label" title="Machines that are down at T. The repair time blocks the machine.">
                        Breakdown
                    </span>
                    <div className="input-group is-col">
                        {breakdowns.map((b, i) => (
                            <div key={i} className="bd-item">
                                <select className="select" value={b.machineId} title="Broken machine"
                                    onChange={e => patchBreakdown(i, { machineId: e.target.value })}>
                                    <option value=''>-- Machine --</option>
                                    {machines.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                                </select>
                                <input type="number" min="1" className="input input-short" value={b.repairMinutes}
                                    title="Repair time (minutes)"
                                    onChange={e => patchBreakdown(i, { repairMinutes: e.target.value })} />
                                <span className="bd-unit">min</span>
                                <button className="btn btn-danger" title="Remove"
                                    onClick={() => setBreakdowns(breakdowns.filter((_, j) => j !== i))}>✕</button>
                            </div>
                        ))}
                        <div className="bd-item">
                            {breakdowns.length === 0 && <span className="date-display">No breakdown</span>}
                            <button className="btn btn-ghost"
                                onClick={() => setBreakdowns([...breakdowns, { machineId: '', repairMinutes: 60 }])}>
                                + Add
                            </button>
                        </div>
                    </div>
                </div>

                <p className="panel-desc" style={{ marginTop: 12 }}>
                    Simulate the shop floor at time T: steps finished before T freeze as history; the step running at T
                    resumes after repair without re-setup; everything else is re-optimized. Progress is derived from the
                    base run (plan-adherence assumption).
                </p>
            </div>

            {preview && (
                <>
                    <h4 className="section-title">
                        State at T
                        <span className="hint"> ({preview.done} done · {preview.list.filter(x => x.state === 'RUNNING').length} running · {preview.list.filter(x => x.state === 'TODO').length} not started)</span>
                    </h4>
                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr>
                                <th>Order</th><th className="num">Step</th><th>Machine</th>
                                <th>Status</th><th className="num">Remaining (min)</th>
                            </tr></thead>
                            <tbody>
                                {preview.list.map(r => (
                                    <tr key={r.key}>
                                        <td>{r.orderCode}</td>
                                        <td className="num">{r.step}</td>
                                        <td>{r.machineCode}</td>
                                        <td className={r.state === 'RUNNING' ? 'st-running' : 'st-todo'}>{r.state}</td>
                                        <td className="num">{r.remaining}</td>
                                    </tr>
                                ))}
                                {preview.list.length === 0 && <tr><td colSpan={5} className="ok-note">Nothing left to run at T.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
export default ReschedulePanel;