import React, { useEffect, useState } from 'react';
import { listRuns, compareRuns } from '../services/api';

const STATUS_COLOR = { improved: '#27ae60', worsened: '#e74c3c', shifted: '#f39c12', same: '#888', missing: '#888' };
const STATUS_LABEL = {
    improved: 'Improved', worsened: 'Worsened', shifted: 'Shifted',
    same: 'Same', missing: 'Missing'
};
const fmt = (iso) => iso ? new Date(iso).toLocaleString() : '-';
const runLabel = (r) => `Run #${r.id} ${r.run_type === 'RESCHEDULE' ? `(RESCHEDULE ← #${r.parent_run_id})` : '(PLAN)'}`;

const RunCompare = ({ refreshKey }) => {
    const [runs, setRuns] = useState([]);
    const [runA, setRunA] = useState('');
    const [runB, setRunB] = useState('');
    const [result, setResult] = useState(null);
    useEffect(() => {
        listRuns().then(r => {
            setRuns(r);
            setRunB((prev) => prev || (r[0] ? String(r[0].id) : ''));
            setRunA((prev) => prev || (r[1] ? String(r[1].id) : ''));
        }).catch(() => {});
    }, [refreshKey]);
    useEffect(() => {
        if (!runA || !runB || runA === runB) { setResult(null); return; }
        compareRuns(Number(runA), Number(runB)).then(setResult).catch(() => setResult(null));
    }, [runA, runB]);
    const th = { padding: '6px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1' };
    return (
        <div className="quadrant" style={{ padding: 15, display: 'flex', flexDirection: 'column' }}>
            <p style={{ margin: '0 0 10px 0', fontSize: 13, color: '#666' }}>
                compare two schedule
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <label>Old: <select value={runA} onChange={e => setRunA(e.target.value)}>
                    {runs.map(r => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}</select></label>
                <label>New: <select value={runB} onChange={e => setRunB(e.target.value)}>
                    {runs.map(r => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}</select></label>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {!result && <div className="placeholder-content" style={{ height: 120 }}>Select to compare</div>}
                {result && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr>
                            <th style={th}>Order</th><th style={th}>Due date</th>
                            <th style={th}>Finish old</th><th style={th}>Late old</th>
                            <th style={th}>Finish new</th><th style={th}>Late new</th>
                            <th style={th}>Δ min</th><th style={th}>Status</th>
                        </tr></thead>
                        <tbody>
                            {result.orders.map(o => (
                                <tr key={o.orderId} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: 6 }}>{o.code}</td>
                                    <td style={{ padding: 6 }}>{fmt(o.due)}</td>
                                    <td style={{ padding: 6 }}>{fmt(o.a?.end)}</td>
                                    <td style={{ padding: 6 }}>{o.a?.tardiness ?? '-'}</td>
                                    <td style={{ padding: 6 }}>{fmt(o.b?.end)}</td>
                                    <td style={{ padding: 6 }}>{o.b?.tardiness ?? '-'}</td>
                                    <td style={{ padding: 6 }}>{o.deltaEndMinutes ?? '-'}</td>
                                    <td style={{ padding: 6, color: STATUS_COLOR[o.status], fontWeight: 'bold' }}>{STATUS_LABEL[o.status]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
export default RunCompare;