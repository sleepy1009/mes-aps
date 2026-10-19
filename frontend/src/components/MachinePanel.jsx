import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { listDowntimes, addDowntime, deleteDowntime, updateMachineRate } from '../services/api';
const API_BASE = 'http://localhost:3000/api';
const TYPE_LABEL = { PM: 'PM', BREAKDOWN: 'Breakdown' };

const MachinePanel = ({ onChanged }) => {
    const [machines, setMachines] = useState([]);
    const [downtimes, setDowntimes] = useState([]);
    const [form, setForm] = useState({ machineId: '', startTime: '', endTime: '', type: 'PM', description: '' });
    const load = async () => {
        const info = await axios.get(`${API_BASE}/dataset/info`);
        setMachines(info.data.machines);
        setDowntimes(await listDowntimes());
    };
    useEffect(() => { load(); }, []);
    const submit = async () => {
        if (!form.machineId || !form.startTime || !form.endTime) {
            alert('Select machine, start - end for PM/Breakdown.');
            return;
        }
        try {
            await addDowntime({
                machineId: Number(form.machineId),
                startTime: new Date(form.startTime).toISOString(),
                endTime: new Date(form.endTime).toISOString(),
                type: form.type, description: form.description.trim() || null
            });
            setForm({ ...form, description: '' });
            await load();
            if (onChanged) onChanged();
        } catch (e) { alert(e.response?.data?.message || 'error for inclue Downtime'); }
    };
    const th = { padding: '6px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1' };
    const input = { padding: 4, border: '1px solid #ccc', borderRadius: 4 };
    return (
        <div className="quadrant" style={{ padding: 15, overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 6px 0' }}>Efficiency</h4>
            <p style={{ margin: '0 0 8px 0', fontSize: 12, color: '#777' }}>
                (0, 1].
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                <thead><tr><th style={th}>Machine</th><th style={th}>Efficiency</th><th style={th}></th></tr></thead>
                <tbody>
                    {machines.map(m => (
                        <MachineRateRow key={m.id} machine={m} onSaved={() => { load(); if (onChanged) onChanged(); }} />
                    ))}
                </tbody>
            </table>

            <h4 style={{ margin: '0 0 6px 0' }}>Downtime</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <select value={form.machineId} onChange={e => setForm({ ...form, machineId: e.target.value })} style={input}>
                    <option value=''>-- Machine --</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                </select>
                <input type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} style={input} />
                <input type="datetime-local" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} style={input} />
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={input}>
                    <option value="PM">PM</option><option value="BREAKDOWN">Breakdown</option>
                </select>
                <input type="text" maxLength={255} placeholder="Reaso;n"
                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    style={{ ...input, flex: 1, minWidth: 200 }} />
                <button onClick={submit} style={{ padding: '6px 12px', background: '#8e44ad', color: '#fff', border: 'none', borderRadius: 4 }}>Add</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>
                    <th style={th}>Machine</th><th style={th}>From</th><th style={th}>To</th>
                    <th style={th}>Type</th><th style={th}>Reason</th><th style={th}></th>
                </tr></thead>
                <tbody>
                    {downtimes.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: 6 }}>{d.machine_code}</td>
                            <td style={{ padding: 6 }}>{new Date(d.start_time).toLocaleString()}</td>
                            <td style={{ padding: 6 }}>{new Date(d.end_time).toLocaleString()}</td>
                            <td style={{ padding: 6 }}>{TYPE_LABEL[d.type] || d.type}</td>
                            <td style={{ padding: 6, color: d.description ? '#222' : '#aaa' }}>{d.description || '-'}</td>
                            <td style={{ padding: 6 }}>
                                <button onClick={async () => { await deleteDowntime(d.id); load(); if (onChanged) onChanged(); }}
                                    style={{ color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}>Delete </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const MachineRateRow = ({ machine, onSaved }) => {
    const [rate, setRate] = useState(Number(machine.rate ?? 1));
    const [saving, setSaving] = useState(false);
    useEffect(() => setRate(Number(machine.rate ?? 1)), [machine.rate]);
    const save = async () => {
        if (!(rate > 0) || rate > 1) {
            alert(`Efficiency (0, 1]. your: ${rate}`);
            return;
        }
        setSaving(true);
        try {
            await updateMachineRate(machine.id, rate);
            onSaved();
        } catch (e) {
            alert(e.response?.data?.message || 'error save Efficiency');
        } finally {
            setSaving(false);
        }
    };
    return (
        <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 6 }}>{machine.code}</td>
            <td style={{ padding: 6 }}>
                <input type="number" min="0.01" max="1" step="0.05" value={rate}
                    onChange={e => setRate(Number(e.target.value))} style={{ width: 70, padding: 4 }} />
            </td>
            <td style={{ padding: 6 }}>
                <button onClick={save} disabled={saving}
                    style={{ padding: '4px 10px', background: saving ? '#95a5a6' : '#3498db', color: '#fff', border: 'none', borderRadius: 4, cursor: saving ? 'default' : 'pointer' }}>
                    {saving ? '...' : 'Save'}
                </button>
            </td>
        </tr>
    );
};
export default MachinePanel;