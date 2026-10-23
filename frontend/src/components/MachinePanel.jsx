import React, { useEffect, useState } from 'react';
import { fetchDatasetInfo, listDowntimes, addDowntime, deleteDowntime, updateMachineRate } from '../services/api';
import { useToast } from '../ToastContext';
import { fmtDateTime, fmtDuration } from '../utils/format';

const TYPE_LABEL = { PM: 'PM', BREAKDOWN: 'Breakdown' };
const TYPE_DOT = { PM: '#3498db', BREAKDOWN: '#e74c3c' };
const TYPE_TIP = { PM: 'Planned maintenance', BREAKDOWN: 'Unplanned failure' };

const savedRate = (m) => Number(m.rate ?? 1);
const errMsg = (e) => e?.response?.data?.message || e?.message || 'Unknown error';

const MachinePanel = ({ onChanged }) => {
    const [machines, setMachines] = useState([]);
    const [downtimes, setDowntimes] = useState([]);
    const [rates, setRates] = useState({});
    const [savingRates, setSavingRates] = useState(false);
    const [stale, setStale] = useState(false);
    const [form, setForm] = useState({ machineId: '', startTime: '', endTime: '', type: 'PM', description: '' });
    const toast = useToast();

    const loadMachines = async () => {
        const info = await fetchDatasetInfo();
        setMachines(info.machines);
        setRates(Object.fromEntries(info.machines.map(m => [m.id, String(savedRate(m))])));
    };
    const loadDowntimes = async () => setDowntimes(await listDowntimes());
    useEffect(() => {
        Promise.all([loadMachines(), loadDowntimes()])
            .catch(e => toast({ kind: 'error', message: errMsg(e) }));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const draft = (m) => rates[m.id] ?? String(savedRate(m));
    const isValid = (m) => { const n = Number(draft(m)); return draft(m) !== '' && n > 0 && n <= 1; };
    const isDirty = (m) => Number(draft(m)) !== savedRate(m);
    const dirty = machines.filter(isDirty);

    const saveRates = async () => {
        const bad = dirty.filter(m => !isValid(m));
        if (bad.length) {
            toast({ kind: 'error', message: `Enter an efficiency above 0 and up to 1 for: ${bad.map(m => m.code).join(', ')}.` });
            return;
        }
        setSavingRates(true);
        const results = await Promise.allSettled(dirty.map(m => updateMachineRate(m.id, Number(draft(m)))));
        const failed = dirty.map((m, i) => ({ m, r: results[i] })).filter(x => x.r.status === 'rejected');
        const keep = Object.fromEntries(failed.map(x => [x.m.id, draft(x.m)]));   // failed rows keep what the user typed
        const okCount = dirty.length - failed.length;
        try { await loadMachines(); } catch { /* the toast below still reports the outcome */ }
        setRates(prev => ({ ...prev, ...keep }));
        setSavingRates(false);
        if (okCount) { setStale(true); if (onChanged) onChanged(); }
        if (failed.length) {
            toast({ kind: 'error', message: `${okCount} saved, ${failed.length} failed: ${failed.map(x => `${x.m.code} (${errMsg(x.r.reason)})`).join(', ')}` });
        } else {
            toast({ kind: 'success', message: `Efficiency saved for ${okCount} machine${okCount > 1 ? 's' : ''}.` });
        }
    };

    const durationMin = form.startTime && form.endTime
        ? (new Date(form.endTime) - new Date(form.startTime)) / 60000 : NaN;

    const submit = async () => {
        if (!form.machineId || !form.startTime || !form.endTime) {
            toast({ kind: 'error', message: 'Choose a machine, then set the start and end time.' });
            return;
        }
        if (!(durationMin > 0)) {
            toast({ kind: 'error', message: 'End time must be after the start time.' });
            return;
        }
        try {
            await addDowntime({
                machineId: Number(form.machineId),
                startTime: new Date(form.startTime).toISOString(),
                endTime: new Date(form.endTime).toISOString(),
                type: form.type, description: form.description.trim() || null
            });
            toast({ kind: 'success', message: 'Downtime added.' });
            setForm({ ...form, description: '' });
            await loadDowntimes();
            setStale(true);
            if (onChanged) onChanged();
        } catch (e) { toast({ kind: 'error', message: errMsg(e) }); }
    };

    const removeDowntime = async (id) => {
        try {
            await deleteDowntime(id);
            toast({ kind: 'success', message: 'Downtime removed.' });
            await loadDowntimes();
            setStale(true);
            if (onChanged) onChanged();
        } catch (e) { toast({ kind: 'error', message: errMsg(e) }); }
    };

    return (
        <div className="panel-root">
            {stale && (
                <div className="stale-note" role="status">
                    <b>Plan is outdated.</b> Press <kbd>▶ Run</kbd> to apply these changes to the schedule.
                </div>
            )}

            <h4 className="section-title">
                Efficiency
                <span className="hint"> Rate in (0, 1]. Effective time = ceil(nominal ÷ rate). Setup is not scaled.</span>
            </h4>
            <div className="table-wrap is-compact">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Machine</th>
                            <th>Efficiency</th>
                            <th className="th-action">
                                <button className="btn btn-primary" onClick={saveRates}
                                    disabled={dirty.length === 0 || savingRates}
                                    title={dirty.length ? 'Save every changed machine' : 'Nothing to save'}>
                                    {savingRates ? 'Saving…' : dirty.length ? `Save ${dirty.length} change${dirty.length > 1 ? 's' : ''}` : 'Save'}
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {machines.map(m => {
                            const d = draft(m);
                            const valid = isValid(m);
                            return (
                                <tr key={m.id} className={isDirty(m) ? 'row-dirty' : ''}>
                                    <td>{m.code}</td>
                                    <td colSpan={2}>
                                        <div className="rate-cell">
                                            <input type="number" min="0.01" max="1" step="0.05" value={d}
                                                className={`input input-short${valid ? '' : ' input-invalid'}`}
                                                onChange={e => setRates({ ...rates, [m.id]: e.target.value })}
                                                onKeyDown={e => { if (e.key === 'Enter' && dirty.length && !savingRates) saveRates(); }} />
                                            <span className="rate-hint">
                                                {valid ? `100 min → ${Math.ceil(100 / Number(d))} min` : 'Use a value above 0, up to 1'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {machines.length === 0 && <tr><td colSpan={3} className="empty-cell">No machines yet. Import orders first.</td></tr>}
                    </tbody>
                </table>
            </div>

            <h4 className="section-title">
                Add downtime
                <span className="hint"> PM = planned maintenance · Breakdown = unplanned failure</span>
            </h4>
            <div className="panel-toolbar">
                <select className="select select-rich" value={form.machineId} title="Machine"
                    onChange={e => setForm({ ...form, machineId: e.target.value })}>
                    <option value=''>-- Machine --</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                </select>
                <button className="btn btn-primary" onClick={submit} title="Block the machine for this period">
                    Add downtime
                </button>
            </div>
            <div className="form-stack">
                <div className="field-row">
                    <span className="field-label" title="PM is planned in advance. Breakdown is an unplanned failure.">Type</span>
                    <div className="segmented" role="radiogroup" aria-label="Downtime type">
                        {['PM', 'BREAKDOWN'].map(t => (
                            <button key={t} type="button"
                                className={`seg ${form.type === t ? 'active' : ''}`}
                                onClick={() => setForm({ ...form, type: t })}
                                title={TYPE_TIP[t]} aria-pressed={form.type === t}>
                                <span className="seg-dot" style={{ background: TYPE_DOT[t] }} />
                                {TYPE_LABEL[t]}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="field-row">
                    <span className="field-label" title="The machine becomes unavailable from this time.">Start</span>
                    <div className="input-group">
                        <input type="datetime-local" className="input" value={form.startTime}
                            onChange={e => setForm({ ...form, startTime: e.target.value })} />
                    </div>
                </div>

                <div className="field-row">
                    <span className="field-label" title="The machine is available again from this time.">End</span>
                    <div className="input-group">
                        <input type="datetime-local" className="input" value={form.endTime}
                            onChange={e => setForm({ ...form, endTime: e.target.value })} />
                        <span className="fr-hint">{durationMin > 0 ? `Duration: ${fmtDuration(durationMin)}` : ''}</span>
                    </div>
                </div>

                <div className="field-row">
                    <span className="field-label" title="Optional note shown in the list below.">Reason</span>
                    <div className="input-group">
                        <input type="text" maxLength={255} className="input input-fill"
                            placeholder="Tool change, oil pump..."
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
                    </div>
                </div>
            </div>

            <h4 className="section-title" style={{ marginTop: 20 }}>Downtime windows</h4>
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Machine</th><th>From</th><th>To</th>
                            <th className="num">Duration</th><th>Type</th><th>Reason</th><th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {downtimes.map(d => (
                            <tr key={d.id}>
                                <td>{d.machine_code}</td>
                                <td>{fmtDateTime(d.start_time)}</td>
                                <td>{fmtDateTime(d.end_time)}</td>
                                <td className="num">{fmtDuration((new Date(d.end_time) - new Date(d.start_time)) / 60000)}</td>
                                <td><span className={`tag ${d.type === 'BREAKDOWN' ? 'tag-brk' : 'tag-pm'}`}>{TYPE_LABEL[d.type] || d.type}</span></td>
                                <td>{d.description || '-'}</td>
                                <td>
                                    <button className="btn btn-danger btn-icon" title="Remove this downtime"
                                        aria-label={`Remove downtime on ${d.machine_code}`}
                                        onClick={() => removeDowntime(d.id)}>✕</button>
                                </td>
                            </tr>
                        ))}
                        {downtimes.length === 0 && (
                            <tr><td colSpan={7} className="empty-cell">No downtime yet. Add one above to block a machine.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
export default MachinePanel;