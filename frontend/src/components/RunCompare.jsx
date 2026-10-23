import React, { useEffect, useMemo, useState } from 'react';
import { listRuns, compareRuns } from '../services/api';
import { fmtDateTime } from '../utils/format';

const STATUS_CLASS = { improved: 'st-improved', worsened: 'st-worsened', shifted: 'st-shifted', same: 'st-same', missing: 'st-missing' };
const STATUS_LABEL = { improved: '▲ Improved', worsened: '▼ Worsened', shifted: '◆ Shifted', same: '= Same', missing: '? Missing' };
const SEVERITY = { worsened: 0, shifted: 1, improved: 2, missing: 3, same: 4 };

const runLabel = (r) => `Run #${r.id} ${r.run_type === 'RESCHEDULE' ? `(RESCHEDULE ← #${r.parent_run_id})` : '(PLAN)'}`;
const signed = (n) => (n == null ? '-' : n > 0 ? `+${n}` : String(n));
const Late = ({ v }) => (v == null ? '-' : v ? <b>{v}</b> : <span className="dim">0</span>);
const trend = (a, b) => (b < a ? 'st-improved' : b > a ? 'st-worsened' : '');

const RunCompare = ({ refreshKey }) => {
    const [runs, setRuns] = useState([]);
    const [runA, setRunA] = useState('');
    const [runB, setRunB] = useState('');
    const [result, setResult] = useState(null);
    const [showSame, setShowSame] = useState(false);
    const [showFinish, setShowFinish] = useState(false);

    useEffect(() => {
        listRuns().then(r => {
            setRuns(r);
            setRunB(prev => prev || (r[0] ? String(r[0].id) : ''));
            setRunA(prev => prev || (r[1] ? String(r[1].id) : ''));
        }).catch(() => {});
    }, [refreshKey]);
    useEffect(() => {
        if (!runA || !runB || runA === runB) { setResult(null); return; }
        compareRuns(Number(runA), Number(runB)).then(setResult).catch(() => setResult(null));
    }, [runA, runB]);

    const view = useMemo(() => {
        if (!result) return null;
        const counts = { improved: 0, worsened: 0, shifted: 0, same: 0, missing: 0 };
        let tardOld = 0, tardNew = 0, lateOld = 0, lateNew = 0, gained = 0, paid = 0;
        let lastOld = null, lastNew = null;
        result.orders.forEach(o => {
            counts[o.status] = (counts[o.status] || 0) + 1;
            const ta = o.a?.tardiness || 0;
            const tb = o.b?.tardiness || 0;
            tardOld += ta; tardNew += tb;
            if (ta > 0) lateOld++;
            if (tb > 0) lateNew++;
            if (o.status === 'improved') gained += ta - tb;
            if (o.status === 'worsened') paid += tb - ta;
            const ea = o.a?.end ? new Date(o.a.end).getTime() : null;
            const eb = o.b?.end ? new Date(o.b.end).getTime() : null;
            if (ea != null && (lastOld == null || ea > lastOld)) lastOld = ea;
            if (eb != null && (lastNew == null || eb > lastNew)) lastNew = eb;
        });
        const rows = result.orders
            .filter(o => showSame || o.status !== 'same')
            .sort((x, y) => (SEVERITY[x.status] ?? 9) - (SEVERITY[y.status] ?? 9)
                || String(x.code).localeCompare(String(y.code)));
        return { counts, tardOld, tardNew, lateOld, lateNew, gained, paid, lastOld, lastNew, rows };
    }, [result, showSame]);

    const colCount = showFinish ? 6 : 5;

    return (
        <div className="panel-root">
            <p className="panel-desc">
                Per-order finish time and tardiness between two runs: what order gained and what paid for it.
            </p>

            <div className="panel-toolbar">
                <label className="field-label" htmlFor="cmp-a">Old</label>
                <select id="cmp-a" className="select select-rich" value={runA} onChange={e => setRunA(e.target.value)}>
                    {runs.map(r => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
                </select>
                <button className="btn btn-ghost swap" title="Swap old and new" aria-label="Swap old and new"
                    onClick={() => { const a = runA; setRunA(runB); setRunB(a); }}>⇄</button>
                <label className="field-label" htmlFor="cmp-b">New</label>
                <select id="cmp-b" className="select select-rich" value={runB} onChange={e => setRunB(e.target.value)}>
                    {runs.map(r => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
                </select>
            </div>

            {!view && <div className="empty">Choose two different runs to compare them.</div>}
            {view && (
                <>
                    <div className="cmp-stats">
                        <div className="cmp-stat">
                            <span className="cmp-stat-label">Late orders</span>
                            <span className="cmp-stat-value">
                                {view.lateOld} → <b className={trend(view.lateOld, view.lateNew)}>{view.lateNew}</b>
                            </span>
                        </div>
                        <div className="cmp-stat">
                            <span className="cmp-stat-label">Total tardiness</span>
                            <span className="cmp-stat-value">
                                {view.tardOld} → <b className={trend(view.tardOld, view.tardNew)}>{view.tardNew}</b> min
                            </span>
                        </div>
                        <div className="cmp-stat">
                            <span className="cmp-stat-label">Last finish</span>
                            <span className="cmp-stat-value">
                                {fmtDateTime(view.lastOld)} → <b className={view.lastOld != null && view.lastNew != null ? trend(view.lastOld, view.lastNew) : ''}>{fmtDateTime(view.lastNew)}</b>
                            </span>
                        </div>
                    </div>

                    <div className="cmp-chips">
                        <span className="st-improved">{STATUS_LABEL.improved}: {view.counts.improved} (−{view.gained} min)</span>
                        <span className="st-worsened">{STATUS_LABEL.worsened}: {view.counts.worsened} (+{view.paid} min)</span>
                        <span className="st-shifted">{STATUS_LABEL.shifted}: {view.counts.shifted}</span>
                        <span className="st-same">{STATUS_LABEL.same}: {view.counts.same}</span>
                        {view.counts.missing > 0 && <span className="st-missing">{STATUS_LABEL.missing}: {view.counts.missing}</span>}
                    </div>

                    <div className="cmp-toggles">
                        <label>
                            <input type="checkbox" checked={showSame} onChange={e => setShowSame(e.target.checked)} />
                            Show unchanged orders ({view.counts.same})
                        </label>
                        <label>
                            <input type="checkbox" checked={showFinish} onChange={e => setShowFinish(e.target.checked)} />
                            Show finish times
                        </label>
                    </div>

                    <div className="table-wrap">
                        <table className="table">
                            <thead><tr>
                                <th>Order</th><th>Due</th>
                                {showFinish && <th>Finish (old → new)</th>}
                                <th className="num">Late min (old → new)</th>
                                <th className="num" title="Positive = finishes later in the new run">Δ finish (min)</th>
                                <th>Status</th>
                            </tr></thead>
                            <tbody>
                                {view.rows.map(o => (
                                    <tr key={o.orderId} className={o.status === 'worsened' ? 'row-bad' : ''}>
                                        <td>{o.code}</td>
                                        <td>{fmtDateTime(o.due)}</td>
                                        {showFinish && <td>{fmtDateTime(o.a?.end)} → {fmtDateTime(o.b?.end)}</td>}
                                        <td className="num"><Late v={o.a?.tardiness} /> → <Late v={o.b?.tardiness} /></td>
                                        <td className="num">{signed(o.deltaEndMinutes)}</td>
                                        <td className={STATUS_CLASS[o.status]}>{STATUS_LABEL[o.status]}</td>
                                    </tr>
                                ))}
                                {view.rows.length === 0 && (
                                    <tr><td colSpan={colCount} className="empty-cell">
                                        {result.orders.length === 0 ? 'These runs contain no orders.' : 'No order changed between these runs.'}
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
export default RunCompare;