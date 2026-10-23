import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useToast } from '../ToastContext';

import { API_BASE } from '../services/api';

const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatDisplayDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const pad = (n) => String(n).padStart(2, '0');
    return `${days[d.getDay()]} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PRIORITY_LABELS = {
    1: { en: 'Normal',  color: '#95a5a6', tip: 'Lowest priority. Scheduled after high/urgent orders.' },
    2: { en: 'High',    color: '#f39c12', tip: 'Higher priority. Prefer over Normal orders.' },
    3: { en: 'Urgent',  color: '#e74c3c', tip: 'Highest priority. Heavy tardiness penalty if late.' }
};

const JobDetails = ({ refreshTrigger, onDataChanged }) => {
    const [info, setInfo] = useState(null);
    const [selectedJobId, setSelectedJobId] = useState('');
    const [editableJob, setEditableJob] = useState(null);
    const [qtyDraft, setQtyDraft] = useState('');
    const [editingRelease, setEditingRelease] = useState(false);
    const [editingDue, setEditingDue] = useState(false);
    const toast = useToast();

    const fetchInfo = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/dataset/info`);
            setInfo(res.data);
            setSelectedJobId((prev) =>
                res.data.jobs.some((j) => j.id.toString() === prev)
                    ? prev
                    : (res.data.jobs[0] ? res.data.jobs[0].id.toString() : '')
            );
        } catch {
            toast({ kind: 'error', message: 'Failed to load orders.' });
        }
    }, [toast]);

    useEffect(() => { fetchInfo(); }, [refreshTrigger, fetchInfo]);

    useEffect(() => {
        if (info && selectedJobId) {
            const job = info.jobs.find(j => j.id.toString() === selectedJobId);
            const cloned = job ? JSON.parse(JSON.stringify(job)) : null;
            setEditableJob(cloned);
            setQtyDraft(cloned ? String(cloned.quantity) : '');
            setEditingRelease(false);
            setEditingDue(false);
        }
    }, [info, selectedJobId]);

    // preview: processing time = quantity * cycle_time (recomputed locally)
    const derivedOperations = useMemo(() => {
        if (!editableJob) return [];
        return editableJob.operations.map(op => ({
            ...op,
            time: Math.ceil(Number(editableJob.quantity) * Number(op.cycle_time || op.time))
        }));
    }, [editableJob]);

    const applyQuantity = () => {
        const q = Number(qtyDraft);
        if (!Number.isInteger(q) || q < 1) {
            toast({ kind: 'error', message: 'Quantity must be a positive integer.' });
            return;
        }
        setEditableJob({ ...editableJob, quantity: q });
        toast({ kind: 'info', message: `Quantity updated locally to ${q}. Click Save to persist.` });
    };

    const handleSave = async () => {
        if (!editableJob) return;
        const rel = new Date(editableJob.release_date);
        const due = new Date(editableJob.due_date);
        if (due <= rel) {
            toast({ kind: 'error', message: 'Due date must be after Release date.' });
            return;
        }
        const original = info.jobs.find(j => j.id.toString() === selectedJobId);
        const quantityChanged = original && Number(editableJob.quantity) !== Number(original.quantity);
        const payload = {
            priority: editableJob.priority,
            due_date: editableJob.due_date,
            release_date: editableJob.release_date,
            ...(quantityChanged
                ? { quantity: Number(editableJob.quantity), operations: [] }
                : { operations: derivedOperations.map(o => ({ step: o.step, time: o.time })) })
        };
        try {
            await axios.put(`${API_BASE}/dataset/job/${editableJob.id}`, payload);
            toast({ kind: 'success', message: quantityChanged
                ? `Saved. Processing times recomputed from routing × ${editableJob.quantity}.`
                : 'Order saved.' });
            await fetchInfo();
            if (onDataChanged) onDataChanged();
        } catch (error) {
            toast({ kind: 'error', message: error.response?.data?.message || 'Save failed.' });
        }
    };

    const handleExport = () => {
        if (!info) return;
        const rows = [];
        info.jobs.forEach(job => {
            job.operations.forEach(op => {
                rows.push({
                    'Order': job.code, 'Product': job.product_code, 'Family': job.family_code,
                    'Qty': job.quantity, 'Priority': job.priority,
                    'Release': new Date(job.release_date).toLocaleString(),
                    'Due': new Date(job.due_date).toLocaleString(),
                    'Step': op.step, 'Machine': op.machine, 'Minutes': op.time
                });
            });
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'MasterData');
        XLSX.writeFile(wb, 'MasterData_Export.xlsx');
        toast({ kind: 'success', message: `Exported ${rows.length} rows.` });
    };

    if (!info) return <div className="loading">Loading…</div>;
    if (info.numJobs === 0) return <div className="empty">No orders yet. Import a CSV/Excel file first.</div>;

    return (
        <div className="panel-root">
            <div className="panel-toolbar">
                <select
                    className="select select-rich"
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    title="Select order"
                >
                    {info.jobs.map(job => {
                        const due = new Date(job.due_date);
                        const dueStr = isNaN(due) ? '' :
                            `${String(due.getDate()).padStart(2,'0')}/${String(due.getMonth()+1).padStart(2,'0')} ${String(due.getHours()).padStart(2,'0')}:${String(due.getMinutes()).padStart(2,'0')}`;
                        return (
                            <option key={job.id} value={job.id}>
                                {job.code} · {job.product_code} × {job.quantity} · due {dueStr}
                            </option>
                        );
                    })}
                </select>
                <button className="btn btn-primary" onClick={handleSave} title="Persist changes and reschedule">
                    Save & Run
                </button>
                <button className="btn btn-success" onClick={handleExport} title="Export all orders to Excel">
                    Export
                </button>
            </div>

            {editableJob && (
                <div className="form-stack">
                    <div className="field-row">
                        <span className="field-label">Product</span>
                        <span className="field-value">
                            <b>{editableJob.product_code}</b> - {editableJob.product_name || ''}
                            <span className="pill">{editableJob.family_code}</span>
                        </span>
                    </div>

                    <div className="field-row">
                        <span className="field-label" title="Number of units. Click OK to recompute processing times from routing.">
                            Quantity
                        </span>
                        <div className="input-group">
                            <input
                                type="number" min="1"
                                className="input input-short"
                                value={qtyDraft}
                                onChange={(e) => setQtyDraft(e.target.value)}
                            />
                            <button className="btn btn-ghost" onClick={applyQuantity}
                                title="Recompute the routing snapshot below from quantity x cycle time (local preview only)">
                                Apply
                            </button>
                        </div>
                    </div>

                    <div className="field-row">
                        <span className="field-label" title="Scheduling priority. Urgent orders pay the highest tardiness penalty.">
                            Priority
                        </span>
                        <div className="segmented" role="radiogroup" aria-label="Priority">
                            {[1, 2, 3].map(p => (
                                <button
                                    key={p} type="button"
                                    className={`seg ${editableJob.priority === p ? 'active' : ''}`}
                                    onClick={() => setEditableJob({ ...editableJob, priority: p })}
                                    title={PRIORITY_LABELS[p].tip}
                                    aria-pressed={editableJob.priority === p}
                                >
                                    <span className="seg-dot" style={{ background: PRIORITY_LABELS[p].color }} />
                                    {p} · {PRIORITY_LABELS[p].en}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="field-row">
                        <span className="field-label" title="Earliest time any operation of this order can start (material ready).">
                            Release
                        </span>
                        {editingRelease ? (
                            <div className="input-group">
                                <input type="datetime-local" className="input"
                                    value={toLocalInput(editableJob.release_date)}
                                    onChange={(e) => setEditableJob({ ...editableJob, release_date: e.target.value })}
                                    autoFocus />
                                <button className="btn btn-ghost" onClick={() => setEditingRelease(false)}>Done</button>
                            </div>
                        ) : (
                            <div className="input-group">
                                <span className="date-display">{formatDisplayDate(editableJob.release_date)}</span>
                                <button className="btn btn-ghost" onClick={() => setEditingRelease(true)}>Edit</button>
                            </div>
                        )}
                    </div>

                    <div className="field-row">
                        <span className="field-label" title="Contractual deadline. Order is late if completed after this time.">
                            Due date
                        </span>
                        {editingDue ? (
                            <div className="input-group">
                                <input type="datetime-local" className="input"
                                    value={toLocalInput(editableJob.due_date)}
                                    onChange={(e) => setEditableJob({ ...editableJob, due_date: e.target.value })}
                                    autoFocus />
                                <button className="btn btn-ghost" onClick={() => setEditingDue(false)}>Done</button>
                            </div>
                        ) : (
                            <div className="input-group">
                                <span className="date-display">{formatDisplayDate(editableJob.due_date)}</span>
                                <button className="btn btn-ghost" onClick={() => setEditingDue(true)}>Edit</button>
                            </div>
                        )}
                    </div>

                    <h4 className="section-title">
                        Routing snapshot
                        <span className="hint"> (Time = quantity × cycle time)</span>
                    </h4>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Step</th>
                                    <th>Machine</th>
                                    <th className="num">Cycle (min/unit)</th>
                                    <th className="num">Time (min)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {derivedOperations.map((op, idx) => (
                                    <tr key={idx}>
                                        <td>{op.step}</td>
                                        <td>{op.machine}</td>
                                        <td className="num">{op.cycle_time ?? '-'}</td>
                                        <td className="num">{op.time}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
export default JobDetails;