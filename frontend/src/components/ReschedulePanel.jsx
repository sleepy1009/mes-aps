import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { listRuns, fetchRunResult, reschedule } from '../services/api';

const API_BASE = 'http://localhost:3000/api';
const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const th = { padding: '6px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1' };
const STATE_LABEL = { DONE: 'DONE', RUNNING: 'RUNNING', TODO: 'TODO' };
const STATE_COLOR = { DONE: '#888', RUNNING: '#e67e22', TODO: '#27ae60' };

const ReschedulePanel = ({ onRescheduled }) => {
    const [runs, setRuns] = useState([]);
    const [baseRunId, setBaseRunId] = useState('');
    const [base, setBase] = useState(null);
    const [machines, setMachines] = useState([]);
    const [now, setNow] = useState('');
    const [breakdowns, setBreakdowns] = useState([]);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const loadRuns = () => listRuns().then(r => {
        setRuns(r);
        setBaseRunId(prev => prev || (r[0] ? String(r[0].id) : ''));
    });
    useEffect(() => {
        loadRuns();
        axios.get(`${API_BASE}/dataset/info`).then(r => setMachines(r.data.machines)).catch(() => {});
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
        if (!baseRunId || !now) { setMsg('ERR: Choose Base run and Time T'); return; }
        setBusy(true); setMsg(null);
        try {
            const payload = await reschedule({
                baseRunId: Number(baseRunId),
                now: new Date(now).toISOString(),
                breakdowns: breakdowns
                    .filter(b => b.machineId !== '')
                    .map(b => ({ machineId: Number(b.machineId), repairMinutes: Number(b.repairMinutes) }))
            });
            setMsg(`OK: run #${payload.runId} (RESCHEDULE của #${baseRunId})`);
            await loadRuns();
            if (onRescheduled) onRescheduled(payload);
        } catch (e) {
            setMsg('ERR: ' + (e.response?.data?.message || e.message));
        } finally {
            setBusy(false);
        }
    };

    const input = { padding: 4, border: '1px solid #ccc', borderRadius: 4 };
    return (
        <div className="quadrant" style={{ padding: 15, overflowY: 'auto' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#666' }}>
                explain...
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
                <label>Base run:
                    <select value={baseRunId} onChange={e => setBaseRunId(e.target.value)} style={input}>
                        {runs.map(r => (
                            <option key={r.id} value={r.id}>
                                Run #{r.id} {r.run_type === 'RESCHEDULE' ? `(RESCHEDULE ← #${r.parent_run_id})` : '(PLAN)'}
                            </option>
                        ))}
                    </select>
                </label>
                <label>Time T:
                    <input type="datetime-local" value={now} onChange={e => setNow(e.target.value)} style={input} />
                </label>
                <button onClick={() => setNow(base ? toLocalInput(base.planStart) : now)} style={input}>
                    T = plan start
                </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {breakdowns.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <select value={b.machineId} style={input}
                            onChange={e => setBreakdowns(breakdowns.map((x, j) => j === i ? { ...x, machineId: e.target.value } : x))}>
                            <option value=''>-- Breakdown --</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                        </select>
                        <input type="number" min="1" value={b.repairMinutes} style={{ ...input, width: 70 }}
                            onChange={e => setBreakdowns(breakdowns.map((x, j) => j === i ? { ...x, repairMinutes: e.target.value } : x))} />
                        <span style={{ fontSize: 12 }}>min</span>
                        <button onClick={() => setBreakdowns(breakdowns.filter((_, j) => j !== i))}
                            style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                    </div>
                ))}
                <button onClick={() => setBreakdowns([...breakdowns, { machineId: '', repairMinutes: 60 }])} style={input}>
                    + Breakdown
                </button>
            </div>
            {preview && (
                <div style={{ marginBottom: 10, fontSize: 13 }}>
                    T: <b>{preview.done}</b> Step done · <b>{preview.list.filter(x => x.state === 'RUNNING').length}</b> running · <b>{preview.list.filter(x => x.state === 'TODO').length}</b> not run yet
                    <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 6 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead><tr><th style={th}>Order (đơn)</th><th style={th}>Step</th><th style={th}>Machine</th><th style={th}>Status</th><th style={th}>Remaining - min</th></tr></thead>
                            <tbody>
                                {preview.list.map(r => (
                                    <tr key={r.key} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: 4 }}>{r.orderCode}</td>
                                        <td style={{ padding: 4 }}>{r.step}</td>
                                        <td style={{ padding: 4 }}>{r.machineCode}</td>
                                        <td style={{ padding: 4, color: STATE_COLOR[r.state], fontWeight: 'bold' }}>{STATE_LABEL[r.state]}</td>
                                        <td style={{ padding: 4 }}>{r.remaining}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            <button onClick={submit} disabled={busy}
                style={{ padding: '8px 16px', background: busy ? '#95a5a6' : '#8e44ad', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Processing...' : 'Reschedule at T'}
            </button>
            {msg && <span style={{ marginLeft: 12, fontSize: 13, color: msg.startsWith('OK') ? '#27ae60' : '#e74c3c' }}>{msg}</span>}
        </div>
    );
};
export default ReschedulePanel;