import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import GanttChart from './components/GanttChart';
import JobDetails from './components/JobDetails';
import RunCompare from './components/RunCompare';
import MachinePanel from './components/MachinePanel';
import KpiPanel from './components/KpiPanel';
import ReschedulePanel from './components/ReschedulePanel';
import RoutingDiagram from './components/RoutingDiagram';
import AuditPanel from './components/AuditPanel';
import FeatureDock from './components/FeatureDock';
import { FEATURES } from './utils/panels';
import { fetchSchedule, fetchLatest, importCsv, listDowntimes } from './services/api';
import { TEMPLATE_ROWS } from './utils/data';
import './index.css';

const EMPTY_META = { planStart: null, orderDue: {}, baselines: [], runId: null, snapshotMin: null, lateCount: 0 };

function App() {
    const [schedules, setSchedules] = useState([]);
    const [meta, setMeta] = useState(EMPTY_META);
    const [liveWindows, setLiveWindows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [refreshDataset, setRefreshDataset] = useState(0);
    const [runKey, setRunKey] = useState(0);

    const loadDowntimes = () => {
        listDowntimes()
            .then(rows => setLiveWindows(rows.map(d => ({
                machineId: d.machine_id, machineCode: d.machine_code, type: d.type,
                start: d.start_time, end: d.end_time
            }))))
            .catch(() => {});
    };
    useEffect(() => { loadDowntimes(); }, []);

    const applyPayload = (payload) => {
        if (!payload || payload.empty) { setSchedules([]); return; }
        setSchedules(payload.data || []);
        const orderDue = {};
        (payload.orders || []).forEach(o => { orderDue[o.id] = o.dueAt; });
        setMeta({
            planStart: payload.planStart || null,
            orderDue,
            baselines: payload.baselines || [],
            runId: payload.runId || null,
            lateCount: (payload.orders || []).filter(o => o.status === 'late').length,
            snapshotMin: payload.snapshotAt && payload.planStart
                ? Math.round((new Date(payload.snapshotAt) - new Date(payload.planStart)) / 60000)
                : null
        });
    };
    useEffect(() => { fetchLatest().then(applyPayload).catch(() => {}); }, []);

    const handleCsvUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            setLoading(true);
            setError(null);
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { cellDates: true });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            const res = await importCsv({ rows });
            alert(res.message);
            setSchedules([]);
            setMeta(EMPTY_META);
            setRefreshDataset(prev => prev + 1);
            setRunKey(k => k + 1);
            loadDowntimes(); // import = factory reset: downtime/rate clear, panel need reload
        } catch (err) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };

    const handleDownloadTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Orders');
        XLSX.writeFile(wb, 'APS_import_template.xlsx');
    };

    const handleRunSchedule = async () => {
        setLoading(true); setError(null);
        try {
            applyPayload(await fetchSchedule({}));
            setRunKey(k => k + 1);
        } catch (err) {
            setError(err.response?.data?.message || 'Server error!');
        } finally {
            setLoading(false);
        }
    };

    // which component each toolbar button opens (ids come from utils/panels.js)
    const renderPanel = (id) => {
        switch (id) {
            case 'master': return <JobDetails refreshTrigger={refreshDataset} onDataChanged={handleRunSchedule} />;
            case 'routing': return <RoutingDiagram />;
            case 'kpi': return <KpiPanel runId={meta.runId} baselines={meta.baselines} />;
            case 'compare': return <RunCompare refreshKey={runKey} />;
            case 'machines': return <MachinePanel onChanged={() => { loadDowntimes(); setRunKey(k => k + 1); }} />;
            case 'reschedule': return (
                <ReschedulePanel onRescheduled={(payload) => {
                    applyPayload(payload);
                    setRunKey(k => k + 1);
                    loadDowntimes();
                }} />
            );
            case 'audit': return <AuditPanel refreshKey={runKey} />;
            default: return null;
        }
    };

    return (
        <div className="dashboard-frame">
            <div className="header-controls">
                <div>
                    <h2 style={{ margin: 0, color: '#3498db' }}>APS Core Engine</h2>
                    <span style={{ fontSize: '12px', color: '#888' }}>
                        Import → Run → Gantt & table features
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <button className="btn btn-upload" onClick={handleDownloadTemplate}>⬇ Template</button>
                    <label className="btn btn-upload">
                        📂 Import (CSV/Excel)
                        <input type="file" accept=".csv,.xlsx,.xls" hidden onChange={handleCsvUpload} />
                    </label>
                    <button className="btn btn-run" onClick={handleRunSchedule} disabled={loading}>
                        {loading ? 'Running...' : 'Run'}
                    </button>
                </div>
            </div>
            {error && <div style={{ color: '#ff6b6b', background: '#332222', padding: '10px', borderRadius: '5px' }}>{error}</div>}

            {schedules.length > 0 && !loading ? (
                <GanttChart data={schedules} planStart={meta.planStart} windows={liveWindows}
                    orderDue={meta.orderDue} snapshotMin={meta.snapshotMin} />
            ) : (
                <div className="quadrant" style={{ height: 200 }}>
                    <div className="placeholder-content">
                        {loading ? 'Processing...' : 'Import data and run to see.'}
                    </div>
                </div>
            )}

            <FeatureDock features={FEATURES} renderPanel={renderPanel}
                badges={{ kpi: meta.lateCount > 0 ? `${meta.lateCount} late` : null }} />
        </div>
    );
}
export default App;