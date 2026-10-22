import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { taskColor, textColorOn, colorKeyOf } from '../utils/colors';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

// Routing overview of ONE order. Step boxes use the exact colors of the Resource Gantt
// (hue = order, lightness = step), so a box here IS the block on the chart.
const RoutingDiagram = ({ refreshTrigger }) => {
    const [info, setInfo] = useState(null);
    const [selectedOrderId, setSelectedOrderId] = useState('');

    useEffect(() => {
        axios.get(`${API_BASE}/dataset/info`)
            .then(res => {
                setInfo(res.data);
                setSelectedOrderId(prev =>
                    res.data.jobs.some(j => j.id.toString() === prev)
                        ? prev
                        : (res.data.jobs[0] ? res.data.jobs[0].id.toString() : '')
                );
            })
            .catch(() => {});
    }, [refreshTrigger]);

    const job = useMemo(
        () => (info ? info.jobs.find(j => j.id.toString() === selectedOrderId) || null : null),
        [info, selectedOrderId]
    );
    const steps = useMemo(
        () => (job ? [...job.operations].sort((a, b) => a.step - b.step) : []),
        [job]
    );

    if (!info) return <div className="loading">Loading…</div>;
    if (info.numJobs === 0) return <div className="empty">No orders yet. Import a CSV/Excel file first.</div>;

    const bg = taskColor(colorKeyOf({ product_code: job.product_code }));

    const fmtDue = (iso) => {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    return (
        <div className="panel-root">
            <div className="panel-toolbar">
                <select
                    className="select select-rich"
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    title="Select order"
                >
                    {info.jobs.map(j => (
                        <option key={j.id} value={j.id}>
                            {j.code} · {j.product_code} × {j.quantity} · due {fmtDue(j.due_date)}
                        </option>
                    ))}
                </select>
            </div>

            {job && (
                <>
                    <div className="form-stack">
                        <div className="field-row">
                            <span className="field-label">Product</span>
                            <span className="field-value">
                                <b>{job.product_code}</b> - {job.product_name || ''}
                                <span className="pill">{job.family_code}</span>
                            </span>
                        </div>
                        <div className="field-row">
                            <span className="field-label" title="Sum of processing times of all steps of this order">
                                Total time
                            </span>
                            <span className="field-value">
                                {job.operations.reduce((s, op) => s + Number(op.time || 0), 0)} min
                            </span>
                        </div>
                    </div>

                    <h4 className="section-title">
                        Routing
                        <span className="hint"> (color = product, same as on the Resource Gantt)</span>
                    </h4>
                    <div className="routing-flow">
                        {steps.map((op, idx) => (
                            <React.Fragment key={op.step}>
                                <div
                                    className="routing-step"
                                    style={{ background: bg, color: textColorOn(bg) }}
                                    title={`Step ${op.step} on ${op.machine}: ${op.time} min for ${job.quantity} units (${op.cycle_time ?? '-'} min/unit)`}
                                >
                                    <div className="routing-step-num">{op.step}</div>
                                    <div className="routing-step-machine">{op.machine}</div>
                                    <div className="routing-step-meta">{op.time} min</div>
                                    <div className="routing-step-meta">{op.cycle_time ?? '-'} min/unit</div>
                                </div>
                                {idx < steps.length - 1 && <div className="routing-arrow">→</div>}
                            </React.Fragment>
                        ))}
                        {steps.length === 0 && <div className="empty">This order has no routing steps.</div>}
                    </div>
                </>
            )}
        </div>
    );
};
export default RoutingDiagram;