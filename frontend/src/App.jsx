import React, { useState, useEffect, useRef } from 'react';
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
import Header from './components/Header';
import { ToastProvider, useToast } from './ToastContext';
import { FEATURES } from './utils/panels';
import { fetchSchedule, fetchLatest, importCsv, listDowntimes } from './services/api';
import { TEMPLATE_ROWS } from './utils/data';
import GanttSkeleton from './components/GanttSkeleton';
import GanttEmpty from './components/GanttEmpty';
import './index.css';

const EMPTY_META = { planStart: null, orderDue: {}, baselines: [], runId: null, snapshotMin: null, lateCount: 0 };

const AppInner = () => {
    const [schedules, setSchedules] = useState([]);
    const [meta, setMeta] = useState(EMPTY_META);
    const [liveWindows, setLiveWindows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshDataset, setRefreshDataset] = useState(0);
    const [runKey, setRunKey] = useState(0);

    const ganttRef = useRef(null);
    const scrollToGantt = () => {
        if (ganttRef.current) ganttRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const toast = useToast();

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

    const handleImport = async (file) => {
        try {
            setLoading(true);
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { cellDates: true });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            const res = await importCsv({ rows });
            toast({ kind: 'success', message: res.message });
            setSchedules([]);
            setMeta(EMPTY_META);
            setRefreshDataset(prev => prev + 1);
            setRunKey(k => k + 1);
            loadDowntimes();
        } catch (err) {
            toast({ kind: 'error', message: err.response?.data?.message || err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleTemplate = () => {
        const ws = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Orders');
        XLSX.writeFile(wb, 'APS_import_template.xlsx');
        toast({ kind: 'info', message: 'Template downloaded.' });
    };

    const handleRun = async () => {
        setLoading(true);
        scrollToGantt();
        try {
            applyPayload(await fetchSchedule({}));
            setRunKey(k => k + 1);
            toast({ kind: 'success', message: 'Schedule completed.' });
        } catch (err) {
            toast({ kind: 'error', message: err.response?.data?.message || 'Server error.' });
        } finally {
            setLoading(false);
        }
    };

    const renderPanel = (id) => {
        switch (id) {
            case 'master': return <JobDetails refreshTrigger={refreshDataset} onDataChanged={handleRun} />;
            case 'routing': return <RoutingDiagram />;
            case 'kpi': return <KpiPanel runId={meta.runId} baselines={meta.baselines} />;
            case 'compare': return <RunCompare refreshKey={runKey} />;
            case 'machines': return <MachinePanel onChanged={() => { loadDowntimes(); setRunKey(k => k + 1); }} />;
            case 'reschedule': return (
                <ReschedulePanel onRescheduled={(payload) => {
                    applyPayload(payload);
                    setRunKey(k => k + 1);
                    loadDowntimes();
                    scrollToGantt();
                }} />
            );
            case 'audit': return <AuditPanel refreshKey={runKey} />;
            default: return null;
        }
    };

    return (
        <div className="dashboard-frame">
            <Header
                onTemplate={handleTemplate}
                onImport={handleImport}
                onRun={handleRun}
                loading={loading}
            />
            <div ref={ganttRef} style={{ scrollMarginTop: 8 }}>
                {loading ? (
                    <GanttSkeleton />
                ) : schedules.length > 0 ? (
                    <GanttChart
                        data={schedules}
                        planStart={meta.planStart}
                        windows={liveWindows}
                        orderDue={meta.orderDue}
                        snapshotMin={meta.snapshotMin}
                        lateCount={meta.lateCount}
                    />
                ) : (
                    <GanttEmpty />
                )}
            </div>
            <FeatureDock
                features={FEATURES}
                renderPanel={renderPanel}
                badges={{ kpi: meta.lateCount > 0 ? `${meta.lateCount} late` : null }}
            />
        </div>
    );
};

const App = () => (
    <ToastProvider>
        <AppInner />
    </ToastProvider>
);
export default App;