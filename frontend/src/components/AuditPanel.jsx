import React, { useEffect, useState } from 'react';
import { listAudit } from '../services/api';

const th = { padding: '6px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1', position: 'sticky', top: 0 };
const ACTION_VI = {
    RUN_SCHEDULE: 'run...', RESCHEDULE: 'reschedule', IMPORT_CSV: 'upload file', IMPORT_EXCEL: 'upload file',
    UPDATE_ORDER: 'update order', ADD_DOWNTIME: 'add machine broken', DELETE_DOWNTIME: 'delete machine broken', UPDATE_MACHINE_RATE: 'update efficiency'
};

const AuditPanel = ({ refreshKey }) => {
    const [rows, setRows] = useState([]);
    const [err, setErr] = useState(null);
    const load = () => listAudit().then(r => { setRows(r); setErr(null); }).catch(e => setErr(e.message));
    useEffect(() => { load(); }, [refreshKey]);
    return (
        <div className="quadrant" style={{ padding: 15, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#666' }}>
                    Audit log: who, when?. {rows.length} files.
                </span>
                <button onClick={load} style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}>Reload</button>
            </div>
            {err && <div style={{ color: '#e74c3c', marginBottom: 8 }}>{err}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>
                    <th style={th}>Time</th><th style={th}>User</th><th style={th}>Action</th>
                    <th style={th}>Entity</th><th style={th}>Payload</th>
                </tr></thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: 5 }}>{new Date(r.created_at).toLocaleString()}</td>
                            <td style={{ padding: 5 }}>{r.user_id}</td>
                            <td style={{ padding: 5, fontWeight: 'bold' }}>
                                {r.action}{ACTION_VI[r.action] ? ` (${ACTION_VI[r.action]})` : ''}
                            </td>
                            <td style={{ padding: 5 }}>{r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
                            <td style={{ padding: 5, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                title={JSON.stringify(r.payload)}>
                                {JSON.stringify(r.payload)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
export default AuditPanel;