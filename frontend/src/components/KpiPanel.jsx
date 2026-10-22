import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchRunKpis, fetchRunResult } from '../services/api';

const pct = (x) => (x === null || x === undefined) ? '-' : (x * 100).toFixed(1) + '%';
const BASELINE_NAME = { FIFO: 'FIFO (first in first out)', EDD: 'EDD (earliest due date)' };

// one KPI = one field-row, same visual language as Master data (label left, value right)
const FieldRow = ({ label, tip, value, bad }) => (
    <div className="field-row">
        <span className="field-label" title={tip}>{label}</span>
        <span className={`field-value${bad ? ' bad' : ''}`}>{value}</span>
    </div>
);

const KpiPanel = ({ runId, baselines = [] }) => {
    const [k, setK] = useState(null);
    const [result, setResult] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => {
        if (!runId) { setK(null); setResult(null); return; }
        setK(null); setResult(null); setErr(null);
        fetchRunKpis(runId).then(setK).catch(e => setErr(e.response?.data?.message || e.message));
        fetchRunResult(runId).then(setResult).catch(() => setResult(null));
    }, [runId]);

    const exportSchedule = () => {
        if (!result) return;
        const rows = (result.data || []).map(t => ({
            'Order': t.orderCode, 'Product': t.productCode, 'Step': t.step, 'Machine': t.machineCode,
            'Status': ['Plan', 'Fixed', 'History'][t.status || 0],
            'Start setup': t.setupStartAt ? new Date(t.setupStartAt).toLocaleString() : '',
            'Start': t.startAt ? new Date(t.startAt).toLocaleString() : '',
            'End': t.endAt ? new Date(t.endAt).toLocaleString() : '',
            'Setup min': t.setupMinutes, 'Process min': t.endTime - t.startTime
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
        XLSX.writeFile(wb, `Schedule_run${runId}.xlsx`);
    };

    const lateOrders = (result?.orders || []).filter(o => o.status === 'late');
    const avgUtil = k && k.machines.length
        ? k.machines.reduce((s, m) => s + (m.utilization || 0), 0) / k.machines.length
        : 0;

    return (
        <div className="panel-root">
            <div className="panel-toolbar">
                <span className="field-value-2">
                    {runId ? <><b>Run #{runId}</b>{k ? <span className="pill"></span> : null}</> : 'No run selected'}
                </span>
                <span className="toolbar-spacer" />
                {result && (
                    <button className="btn btn-success" onClick={exportSchedule}
                        title="Export this run's schedule (all tasks) to Excel">
                        Export
                    </button>
                )}
            </div>

            {!runId && <div className="empty">No schedule yet. Import data and run.</div>}
            {err && <div className="form-error">{err}</div>}

            {k && (
                <>
                    <div className="form-stack">
                        <FieldRow label="Makespan" tip="Total length of the schedule: finish time of the last task."
                            value={`${k.makespan} min (${(k.makespan / 60).toFixed(1)} h)`} />
                        <FieldRow label="Ends" tip="Clock time when the last task finishes."
                            value={k.makespan ? new Date(new Date(k.planStart).getTime() + k.makespan * 60000).toLocaleString() : '-'} />
                        <FieldRow label="Late orders" tip="Orders finishing after their due date."
                            value={`${k.lateOrders} / ${k.orders.length}`} bad={k.lateOrders > 0} />
                        <FieldRow label="OTD" tip="On-Time Delivery: share of orders finishing on or before due date."
                            value={pct(k.otd)} bad={k.otd < 1} />
                        <FieldRow label="Tardiness" tip="Sum of minutes late across all late orders."
                            value={`${k.totalTardiness} min`} bad={k.totalTardiness > 0} />
                        <FieldRow label="Setup ratio" tip="Setup minutes / (setup + cutting) minutes."
                            value={pct(k.setupRatio)} />
                        <FieldRow label="Bottleneck" tip="Machine with the highest running utilization."
                            value={k.bottleneckCode || '-'} />
                        <FieldRow label="Avg utilization" tip="Average of (cutting + setup) / available time across machines."
                            value={pct(avgUtil)} />
                    </div>

                    <h4 className="section-title">
                        Machine load
                        <span className="hint"> (cutting = spindle time · booked = held incl. idle wait)</span>
                    </h4>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Machine</th>
                                    <th className="num" title="Sum of (End - Start) per task">Cutting</th>
                                    <th className="num">Setup</th>
                                    <th className="num" title="Setup + idle wait + cutting: machine held for orders">Booked</th>
                                    <th className="num">Unavail.</th>
                                    <th title="(Cutting + Setup) / (makespan - unavailable)">Utilization</th>
                                </tr>
                            </thead>
                            <tbody>
                                {k.machines.map(m => (
                                    <tr key={m.machineId}>
                                        <td>{m.code}</td>
                                        <td className="num">{m.cuttingMinutes}</td>
                                        <td className="num">{m.setupMinutes}</td>
                                        <td className="num">{m.bookedMinutes}</td>
                                        <td className="num">{m.unavailableMinutes}</td>
                                        <td>
                                            <div className="util-bar">
                                                <div className={`util-fill${m.machineId === k.bottleneckMachineId ? ' bottleneck' : ''}`}
                                                    style={{ width: `${Math.min(100, (m.utilization || 0) * 100)}%` }} />
                                            </div>
                                            <span className="table-note">{pct(m.utilization)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h4 className="section-title">
                        Late orders & cause
                        <span className="hint"> (longest single wait of each late order)</span>
                    </h4>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th className="num">Late (min)</th>
                                    <th>Cause</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lateOrders.length === 0 && (
                                    <tr><td colSpan={3} className="ok-note">No late order.</td></tr>
                                )}
                                {lateOrders.map(o => (
                                    <tr key={o.id}>
                                        <td>{o.code}</td>
                                        <td className="num">{o.lateMinutes}</td>
                                        <td>
                                            {o.worstWait
                                                ? `Waited ${o.worstWait.minutes} min before step ${o.worstWait.step} on ${o.worstWait.machineCode} (machine busy or changeover)`
                                                : 'Due date too tight vs release (no dominant wait)'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <h4 className="section-title">
                        GA vs baseline
                    </h4>
                    <div className="table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Algorithm</th>
                                    <th className="num">Makespan</th>
                                    <th className="num">Late orders</th>
                                    <th className="num">Tardiness</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="row-strong">
                                    <td>GA (this run)</td>
                                    <td className="num">{k.makespan}</td>
                                    <td className="num">{k.lateOrders}</td>
                                    <td className="num">{k.totalTardiness}</td>
                                </tr>
                                {baselines.map(b => (
                                    <tr key={b.name}>
                                        <td>{BASELINE_NAME[b.name] || b.name}</td>
                                        <td className="num">{b.kpis.makespanMinutes}</td>
                                        <td className="num">{b.kpis.lateOrders}</td>
                                        <td className="num">{b.kpis.totalLateMinutes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="table-note">
                        FIFO/EDD baselines dispatch whole orders block-wise (no interleaving of operations
                        between orders) — weaker than true queue-based dispatching; label kept honest.
                    </p>
                </>
            )}
        </div>
    );
};
export default KpiPanel;