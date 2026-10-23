import React, { useEffect, useMemo, useState } from 'react';
import { listAudit } from '../services/api';

const ACTION_EN = {
    RUN_SCHEDULE: 'GA schedule run', RESCHEDULE: 'Reactive reschedule', IMPORT_CSV: 'Dataset import',
    IMPORT_EXCEL: 'Dataset import', UPDATE_ORDER: 'Order edit', ADD_DOWNTIME: 'Downtime added',
    DELETE_DOWNTIME: 'Downtime removed', UPDATE_MACHINE_RATE: 'Efficiency updated'
};

const AuditPanel = ({ refreshKey }) => {
    const [rows, setRows] = useState([]);
    const [err, setErr] = useState(null);
    const [openId, setOpenId] = useState(null);
    const [filter, setFilter] = useState('ALL');
    const load = () => listAudit().then(r => { setRows(r); setErr(null); }).catch(e => setErr(e.message));
    useEffect(() => { load(); }, [refreshKey]);

    // options derived from real data: never stale, never shows actions that do not exist
    const options = useMemo(() => [...new Set(rows.map(r => r.action))].sort(), [rows]);
    useEffect(() => {
        if (filter !== 'ALL' && !options.includes(filter)) setFilter('ALL');
    }, [options, filter]);
    const filtered = filter === 'ALL' ? rows : rows.filter(r => r.action === filter);

    return (
        <div className="panel-root">
            <div className="panel-toolbar">
                <span className="panel-desc">
                    Who changed what, when · {filtered.length}/{rows.length} entries.
                </span>
                <span className="toolbar-spacer" />
                <select
                    className="select audit-filter"
                    value={filter}
                    onChange={e => { setFilter(e.target.value); setOpenId(null); }}
                    title="Filter by action"
                >
                    <option value="ALL">All actions</option>
                    {options.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <button className="btn btn-ghost audit-reload-btn" onClick={load} title="Reload audit log">Reload</button>
            </div>
            {err && <div className="form-error">{err}</div>}
            <div className="table-wrap">
                <table className="table">
                    <thead><tr>
                        <th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Payload</th>
                    </tr></thead>
                    <tbody>
                        {filtered.map(r => (
                            <React.Fragment key={r.id}>
                                <tr className="row-clickable" title="Click to expand payload"
                                    onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                                    <td>{new Date(r.created_at).toLocaleString()}</td>
                                    <td>{r.user_id}</td>
                                    <td><b>{r.action}</b></td>
                                    <td>{r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
                                    <td>{openId === r.id ? '▴' : '▾'}</td>
                                </tr>
                                {openId === r.id && (
                                    <tr>
                                        <td colSpan={5}>
                                            <pre className="payload-pre">{JSON.stringify(r.payload, null, 2)}</pre>
                                            <span className="table-note">{ACTION_EN[r.action] || ''}</span>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                        {filtered.length === 0 && (
                            <tr><td colSpan={5} className="ok-note">
                                {rows.length === 0 ? 'No audit entries yet.' : 'No entries for this filter.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
export default AuditPanel;