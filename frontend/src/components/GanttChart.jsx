import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';

const GanttChart = ({ data }) => {
    const { categories, chartData } = useMemo(() => {
        const machines = [...new Set(data.map(item => `Machine ${item.machineId}`))].sort();
        
        const getJobStepColor = (jobId) => {
            const hue = (jobId * 40) % 360;
            return `hsl(${hue}, 70%, 50%)`;
        };


        const seriesData = data.map(task => {
            const machineIndex = machines.indexOf(`Machine ${task.machineId}`);
            const duration = task.endTime - task.startTime;
            
            return {
                name: `Job ${task.orderId}`,
                value: [
                    machineIndex,
                    task.startTime,
                    task.endTime,
                    task.step,
                    duration
                ],
                itemStyle: {
                    color: getJobStepColor(task.orderId)
                }
            };
        });

        return { categories: machines, chartData: seriesData };
    }, [data]);

    const renderItem = (params, api) => {
        const categoryIndex = api.value(0);
        const start = api.coord([api.value(1), categoryIndex]);
        const end = api.coord([api.value(2), categoryIndex]);
        const height = api.size([0, 1])[1] * 0.6;

        const rectShape = echarts.graphic.clipRectByRect({
            x: start[0],
            y: start[1] - height / 2,
            width: end[0] - start[0],
            height: height
        }, {
            x: params.coordSys.x,
            y: params.coordSys.y,
            width: params.coordSys.width,
            height: params.coordSys.height
        });

        return rectShape && {
            type: 'rect',
            transition: ['shape'],
            shape: rectShape,
            style: api.style()
        };
    };

    const option = {
        tooltip: {
            formatter: function (params) {
                const p = params.value;
                return `
                    <div style="font-weight:bold; color:${params.color}">${params.name} - Step ${p[3]}</div>
                    Start: ${p[1]} (minutes)<br/>
                    End: ${p[2]} (minutes)<br/>
                    Run Time: ${p[4]} (minutes)
                `;
            }
        },
        dataZoom: [
            {
                type: 'slider',
                filterMode: 'weakFilter',
                showDataShadow: false,
                top: 400,
                labelFormatter: ''
            },
            {
                type: 'inside',
                filterMode: 'weakFilter'
            }
        ],
        grid: {
            height: 300,
            left: '8%',
            right: '3%',
            top: '5%'
        },
        xAxis: {
            type: 'value',
            position: 'top',
            min: 0,
            axisLabel: {
                formatter: '{value} ph'
            },
            splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        yAxis: {
            type: 'category',
            data: categories,
            axisLine: { show: true },
            axisTick: { show: true },
            splitLine: { show: true, lineStyle: { type: 'dashed' } }
        },
        series: [
            {
                type: 'custom',
                renderItem: renderItem,
                itemStyle: { opacity: 0.8 },
                encode: {
                    x: [1, 2],
                    y: 0
                },
                data: chartData
            }
        ]
    };

    return (
        <div className="quadrant" style={{ gridColumn: 'span 2' }}>
            <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                Resource Gantt Chart
            </h3>
            <ReactECharts option={option} style={{ height: '450px', width: '100%' }} />
        </div>
    );
};

export default GanttChart;