import React, { useMemo, useRef } from 'react';
import { taskColor, textColorOn, colorKeyOf } from '../utils/colors';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';

const pad = (n) => String(n).padStart(2, '0');
const fmtAxis = (baseMs, v) => {
    const d = new Date(baseMs + v * 60000);
    const h24 = d.getHours();
    const ampm = h24 < 12 ? 'AM' : 'PM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${pad(d.getMinutes())} ${ampm}\n${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
const fmtFull = (baseMs, v) => {
    const d = new Date(baseMs + v * 60000);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const STATUS_LABEL = ['NEW', 'FIXED (resume)', 'HISTORY'];

const DIM = { fill: '#d7dadb', stroke: '#c4c8ca', text: '#9aa0a3' };

// Visual Legend Component
const GanttLegend = () => (
    <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
        padding:'16px 0',
        fontSize: '12px',
        justifyContent: 'flex-end'
    }}>
        {/* HISTORY - gray muted block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
                width: '32px',
                height: '18px',
                backgroundColor: '#bdc3c7',
                opacity: 0.55,
                border: '1px solid #95a5a6',
                borderRadius: '2px'
            }} />
            <span>HISTORY</span>
        </div>

        {/* FIXED - dashed border */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
                width: '32px',
                height: '18px',
                backgroundColor: '#3498db',
                border: '2px dashed #000',
                borderRadius: '2px'
            }} />
            <span>FIXED</span>
        </div>

        {/* LATE - red border */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
                width: '32px',
                height: '18px',
                backgroundColor: '#3498db',
                border: '3px solid #e74c3c',
                borderRadius: '2px'
            }} />
            <span>LATE</span>
        </div>

        {/* PM/Breakdown - larger gray block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
                width: '40px',
                height: '22px',
                backgroundColor: 'rgba(127,140,141,0.45)',
                borderRadius: '2px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <span style={{ fontSize: '9px', color: '#444', fontWeight: 'bold' }}>PM</span>
            </div>
            <span>PM/Breakdown</span>
        </div>

        {/* Step number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
                width: '32px',
                height: '18px',
                backgroundColor: '#3498db',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '10px',
                fontWeight: 'bold'
            }}>
                1
            </div>
            <span>Step i (1→n)</span>
        </div>

        {/* T line - dashed red vertical line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
                width: '2px',
                height: '22px',
                backgroundColor: '#c0392b',
                backgroundImage: 'repeating-linear-gradient(0deg, #c0392b, #c0392b 4px, transparent 4px, transparent 8px)'
            }} />
            <span>T</span>
        </div>

        {/* Hover hint */}
        <div style={{ 
            marginLeft: 'auto',
            color: '#888',
            fontStyle: 'italic'
        }}>
            Hover to highlight order and see step details
        </div>
    </div>
);

const GanttChart = ({ data, planStart, windows = [], orderDue = {}, snapshotMin = null }) => {
    const baseMs = planStart ? new Date(planStart).getTime() : Date.now();

    const { categories, chartData, windowData, snapshotData, horizonEnd } = useMemo(() => {
        const machineMeta = new Map();
        data.forEach(t => {
            if (!machineMeta.has(t.machineId)) {
                machineMeta.set(t.machineId, { code: t.machineCode || `M${t.machineId}`, name: t.machineName || '' });
            }
        });
        const winMinutes = windows
            .map(w => ({
                machineId: w.machineId,
                code: w.machineCode || (machineMeta.get(w.machineId) ? machineMeta.get(w.machineId).code : `M${w.machineId}`),
                type: w.type,
                startMin: Math.max(0, Math.round((new Date(w.start).getTime() - baseMs) / 60000)),
                endMin: Math.round((new Date(w.end).getTime() - baseMs) / 60000)
            }))
            .filter(w => w.endMin > 0);
        winMinutes.forEach(w => {
            if (!machineMeta.has(w.machineId)) machineMeta.set(w.machineId, { code: w.code, name: '' });
        });
        const machineIds = [...machineMeta.keys()].sort((a, b) => a - b);
        const mIndex = new Map(machineIds.map((id, i) => [id, i]));
        const categories = machineIds.map(id => machineMeta.get(id).code);

        const orderEnd = {};
        data.forEach(t => { orderEnd[t.orderId] = Math.max(orderEnd[t.orderId] || 0, t.endTime); });
        const late = new Set();
        Object.entries(orderEnd).forEach(([id, end]) => {
            const due = orderDue[id];
            if (due && end > Math.round((new Date(due).getTime() - baseMs) / 60000)) late.add(Number(id));
        });

        const chartData = data.map(task => ({
            name: task.orderCode || `Job ${task.orderId}`,
            value: [
                mIndex.get(task.machineId),
                task.startTime, task.endTime, task.step,
                task.endTime - task.startTime, task.orderId,
                late.has(task.orderId) ? 1 : 0,
                task.setupMinutes || 0,
                task.status || 0
            ],
            itemStyle: { color: taskColor(colorKeyOf(task)) },
            info: {
                orderCode: task.orderCode, productCode: task.productCode,
                machineCode: task.machineCode, machineName: task.machineName,
                setupStartMin: task.setupStart
            }
        }));

        const windowData = winMinutes.map(w => ({
            name: w.type === 'BREAKDOWN' ? 'Breakdown' : 'PM',
            value: [mIndex.get(w.machineId), w.startMin, w.endMin, w.type === 'BREAKDOWN' ? 1 : 0],
            info: { code: w.code }
        }));

        const snapshotData = snapshotMin !== null && snapshotMin > 0 ? [[snapshotMin]] : [];
        const horizonEnd = Math.max(1, ...data.map(t => t.endTime), ...winMinutes.map(w => w.endMin), snapshotMin || 0);
        return { categories, chartData, windowData, snapshotData, horizonEnd };
    }, [data, windows, orderDue, baseMs, snapshotMin]);


    const chartRef = useRef(null);
    const focusRef = useRef(null);          
    const dataRef = useRef(chartData);
    dataRef.current = chartData;
    const rafRef = useRef(0);

    const onEvents = useMemo(() => {
        const setFocus = (orderId) => {
            if (focusRef.current === orderId) return;
            focusRef.current = orderId;
            const chart = chartRef.current && chartRef.current.getEchartsInstance();
            if (chart) chart.setOption({ series: [{ id: 'tasks', data: dataRef.current }] });
        };
        return {
            mouseover: (p) => {
                if (p.seriesId !== 'tasks') return;
                cancelAnimationFrame(rafRef.current);
                setFocus(p.value[5]);                       
            },
            mouseout: (p) => {
                if (p.seriesId !== 'tasks') return;
                cancelAnimationFrame(rafRef.current);
                rafRef.current = requestAnimationFrame(() => setFocus(null));
            }
        };
    }, []);


    const clip = (params, rect) => echarts.graphic.clipRectByRect(rect, {
        x: params.coordSys.x, y: params.coordSys.y,
        width: params.coordSys.width, height: params.coordSys.height
    });
    const renderWindow = (params, api) => {
        const cat = api.value(0);
        const start = api.coord([api.value(1), cat]);
        const end = api.coord([api.value(2), cat]);
        const height = api.size([0, 1])[1] * 0.85;
        const rect = clip(params, { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height });
        if (!rect) return;
        return {
            type: 'group',
            children: [
                { type: 'rect', shape: rect, style: { fill: 'rgba(127,140,141,0.45)' } },
                { type: 'text', x: rect.x + 2, y: rect.y + 2,
                  style: { text: api.value(3) === 1 ? 'BRK' : 'PM', fill: '#444', font: '10px sans-serif' } }
            ]
        };
    };

    const renderTask = (params, api) => {
        const cat = api.value(0);
        const start = api.coord([api.value(1), cat]);
        const end = api.coord([api.value(2), cat]);
        const height = api.size([0, 1])[1] * 0.6;
        const rect = clip(params, { x: start[0], y: start[1] - height / 2, width: end[0] - start[0], height });
        if (!rect) return;
        const style = api.style();
        const baseFill = style.fill;                      
        const isLate = api.value(6) === 1;
        const st = api.value(8);
        const focus = focusRef.current;
        const dimmed = focus !== null && api.value(5) !== focus;

        if (st === 2) {                       // history: gray, muted
            style.fill = '#bdc3c7';
            style.opacity = 0.55;
            style.stroke = '#95a5a6';
            style.lineWidth = 1;
        } else if (st === 1) {                // committed: dashed black (or red if order late)
            style.stroke = isLate ? '#e74c3c' : '#000';
            style.lineWidth = isLate ? 3 : 2;
            style.lineDash = [6, 3];
        } else {                              // new plan
            style.stroke = isLate ? '#e74c3c' : '#222';
            style.lineWidth = isLate ? 3 : 1;
        }

        if (dimmed) {                         // other
            style.fill = DIM.fill;
            style.stroke = DIM.stroke;
            style.lineWidth = 1;
            style.lineDash = null;
            style.opacity = 0.5;
        } else if (focus !== null) {          // select
            style.opacity = 1;
            style.shadowBlur = 8;
            style.shadowColor = 'rgba(0,0,0,.35)';
        }

        const children = [{ type: 'rect', transition: ['shape'], shape: rect, style }];
        if (rect.width >= 22 && st !== 2) {
            children.push({
                type: 'text', x: rect.x + rect.width / 2, y: rect.y + rect.height / 2,
                style: { text: String(api.value(3)), fill: dimmed ? DIM.text : textColorOn(baseFill),
                        font: 'bold 10px sans-serif', align: 'center', verticalAlign: 'middle' }
            });
        }
        return { type: 'group', children };
    };

    const renderSnapshot = (params, api) => {
        const x = api.coord([api.value(0), 0])[0];
        const top = params.coordSys.y;
        return {
            type: 'line',
            shape: { x1: x, y1: top, x2: x, y2: top + params.coordSys.height },
            style: { stroke: '#c0392b', lineWidth: 2, lineDash: [8, 4] }
        };
    };

    const option = useMemo(() => ({
        tooltip: {
            formatter: (params) => {
                const v = params.value;
                if (params.seriesIndex === 0) {
                    return `<b>${v[3] === 1 ? 'BREAKDOWN' : 'PM'} — ${params.data.info.code}</b><br/>` +
                           `${fmtFull(baseMs, v[1])} → ${fmtFull(baseMs, v[2])}`;
                }
                if (params.seriesIndex === 2) {
                    return `<b>T</b><br/>${fmtFull(baseMs, v[0])}`;
                }
                const i = params.data.info;
                const setup = v[7] > 0 ? `<br/>Setup: ${v[7]} min ${fmtFull(baseMs, i.setupStartMin)})` : '';
                const late = v[6] === 1 ? '<br/><span style="color:#e74c3c">LATE</span>' : '';
                return `<div style="font-weight:bold;color:${params.color}">${i.orderCode} (${i.productCode}) - Step ${v[3]}</div>` +
                       `Status: ${STATUS_LABEL[v[8]]}<br/>` +
                       `Start: ${fmtFull(baseMs, v[1])}<br/>End: ${fmtFull(baseMs, v[2])}<br/>Run time: ${v[4]} min` + setup + late;
            }
        },
        dataZoom: [
            {
                type: 'slider', filterMode: 'weakFilter', showDataShadow: false,
                bottom: 30, height: 20,
                startValue: 0, endValue: Math.min(horizonEnd, 1440),
                labelFormatter: (v) => fmtFull(baseMs, v)
            },
            { type: 'inside', filterMode: 'weakFilter' }
        ],
        grid: { height: 300, left: '8%', right: '3%', top: 40 },
        xAxis: {
            type: 'value', min: 0, max: horizonEnd, position: 'top',
            interval: 60,
            axisTick: { interval: 60 },
            axisLabel: { formatter: (v) => fmtAxis(baseMs, v), hideOverlap: true, fontSize: 10, lineHeight: 12 },
            splitLine: { show: true, interval: 60, lineStyle: { type: 'dashed', color: '#e8e8e8' } }
        },
        yAxis: {
            type: 'category', data: categories,
            axisLine: { show: true }, axisTick: { show: true },
            splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        series: [
            { type: 'custom', renderItem: renderWindow, encode: { x: [1, 2], y: 0 }, data: windowData, z: 1 },
            { id: 'tasks', type: 'custom', renderItem: renderTask, itemStyle: { opacity: 0.85 }, encode: { x: [1, 2], y: 0 }, data: chartData, z: 2 },
            { type: 'custom', renderItem: renderSnapshot, encode: { x: 0 }, data: snapshotData, silent: true, z: 3 }
        ]
    }), [categories, chartData, windowData, snapshotData, horizonEnd, baseMs]); // eslint-disable-line react-hooks/exhaustive-deps

    
    return (
        <div className="quadrant" style={{ gridColumn: 'span 2' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #ddd',
                    gap: '16px'
                }}
            >
                <h2 style={{ margin: 0, flexShrink: 0 }}>
                    Resource Gantt chart
                </h2>

                <GanttLegend />
            </div>

            <ReactECharts
                ref={chartRef}
                option={option}
                onEvents={onEvents}
                style={{
                    height: 'var(--gantt-body-h)',
                    width: '100%'
                }}
            />
        </div>
    );

};
export default GanttChart;