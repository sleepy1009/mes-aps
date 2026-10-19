import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchRunKpis, fetchRunResult } from '../services/api';

const pct = (x) => (x === null || x === undefined) ? '-' : (x * 100).toFixed(1) + '%';
const th = { padding: '6px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1' };
const BASELINE_NAME = { FIFO: 'FIFO (first in first out)', EDD: 'EDD (priority duedate)' };
const Card = ({ label, value, bad }) => (
    <div style={{ background: bad ? '#fdecea' : '#f4f6f7', padding: '8px 10px', borderRadius: 4 }}>
        <div style={{ fontSize: 11, color: '#777' }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 'bold', color: bad ? '#c0392b' : '#222' }}>{value}</div>
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
    return (
        <div className="quadrant" style={{ padding: 15, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#666' }}>
                    {runId ? `Run #${runId} ` : ''}
                </span>
                {result && (
                    <button onClick={exportSchedule}
                        style={{ padding: '6px 12px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                        Export schedule
                    </button>
                )}
            </div>
            {!runId && <div className="placeholder-content">No schedule</div>}
            {err && <div style={{ color: '#e74c3c' }}>{err}</div>}
            {k && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <Card label="Makespan" value={`${k.makespan} phút`} />
                        <Card label="End" value={k.makespan ? new Date(new Date(k.planStart).getTime() + k.makespan * 60000).toLocaleString() : '-'} />
                        <Card label="Late orders / total" value={`${k.lateOrders} / ${k.orders.length}`} bad={k.lateOrders > 0} />
                        <Card label="OTD" value={pct(k.otd)} bad={k.otd < 1} />
                        <Card label="Total tardiness" value={k.totalTardiness} bad={k.totalTardiness > 0} />
                        <Card label="Setup ratio" value={pct(k.setupRatio)} />
                        <Card label="Bottleneck" value={k.bottleneckCode || '-'} />
                        <Card label="Avg utilization" value={pct(k.machines.length ? k.machines.reduce((s, m) => s + (m.utilization || 0), 0) / k.machines.length : 0)} />
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
                        <thead><tr><th style={th}>Machine</th><th style={th}>Busy</th><th style={th}>Setup</th><th style={th}>Unavailable</th><th style={th}>Utilization</th></tr></thead>
                        <tbody>
                            {k.machines.map(m => (
                                <tr key={m.machineId} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: 6 }}>{m.code}</td>
                                    <td style={{ padding: 6 }}>{m.busyMinutes}</td>
                                    <td style={{ padding: 6 }}>{m.setupMinutes}</td>
                                    <td style={{ padding: 6 }}>{m.unavailableMinutes}</td>
                                    <td style={{ padding: 6 }}>
                                        <div style={{ background: '#eee', width: '100%', height: 10, borderRadius: 3 }}>
                                            <div style={{ background: m.machineId === k.bottleneckMachineId ? '#e67e22' : '#3498db',
                                                width: `${Math.min(100, (m.utilization || 0) * 100)}%`, height: 10, borderRadius: 3 }} />
                                        </div>
                                        <span style={{ fontSize: 11 }}>{pct(m.utilization)}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h4 style={{ margin: '0 0 6px 0' }}>Late orders & cause</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
                        <thead><tr><th style={th}>Order</th><th style={th}>Late - min</th><th style={th}>Cause</th></tr></thead>
                        <tbody>
                            {lateOrders.length === 0 && (
                                <tr><td colSpan={3} style={{ padding: 6, color: '#27ae60' }}>No late order.</td></tr>
                            )}
                            {lateOrders.map(o => (
                                <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: 6 }}>{o.code}</td>
                                    <td style={{ padding: 6 }}>{o.lateMinutes}</td>
                                    <td style={{ padding: 6 }}>
                                        {o.worstWait
                                            ? `Wait ${o.worstWait.minutes} min ahead Step ${o.worstWait.step} on ${o.worstWait.machineCode} (Busy or Setup)`
                                            : 'Dua date nearly release'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h4 style={{ margin: '0 0 6px 0' }}>GA vs Baseline</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr><th style={th}>Algorithm</th><th style={th}>Makespan</th><th style={th}>Late orders</th><th style={th}>Tardiness</th></tr></thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid #eee', fontWeight: 'bold' }}>
                                <td style={{ padding: 6 }}>GA</td>
                                <td style={{ padding: 6 }}>{k.makespan}</td>
                                <td style={{ padding: 6 }}>{k.lateOrders}</td>
                                <td style={{ padding: 6 }}>{k.totalTardiness}</td>
                            </tr>
                            {baselines.map(b => (
                                <tr key={b.name} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: 6 }}>{BASELINE_NAME[b.name] || b.name}</td>
                                    <td style={{ padding: 6 }}>{b.kpis.makespanMinutes}</td>
                                    <td style={{ padding: 6 }}>{b.kpis.lateOrders}</td>
                                    <td style={{ padding: 6 }}>{b.kpis.totalLateMinutes}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                        Baseline FIFO/EDD,
                    </p>
                </>
            )}
        </div>
    );
};
export default KpiPanel;