import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

const API_BASE = 'http://localhost:3000/api';

// value for <input type="datetime-local">: local time, not UTC
const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const JobDetails = ({ refreshTrigger, onDataChanged }) => {
    const [info, setInfo] = useState(null);
    const [selectedJobId, setSelectedJobId] = useState('');
    const [editableJob, setEditableJob] = useState(null);

    const fetchInfo = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/dataset/info`);
            setInfo(res.data);
            // keep the current selection if it still exists, otherwise select the first job
            setSelectedJobId((prev) =>
                res.data.jobs.some((j) => j.id.toString() === prev)
                    ? prev
                    : (res.data.jobs[0] ? res.data.jobs[0].id.toString() : '')
            );
        } catch (err) {
            console.error("Error fetching job information:", err);
        }
    }, []);

    useEffect(() => {
        fetchInfo();
    }, [refreshTrigger, fetchInfo]);

    useEffect(() => {
        if (info && selectedJobId) {
            const job = info.jobs.find(j => j.id.toString() === selectedJobId);
            setEditableJob(job ? JSON.parse(JSON.stringify(job)) : null);
        }
    }, [info, selectedJobId]);


    const handleSaveAndReschedule = async () => {
        const rel = new Date(editableJob.release_date);
        const due = new Date(editableJob.due_date);
        if (due <= rel) { alert('Due date should <= Release.'); return; }
        
        if (!editableJob) return;
        const original = info.jobs.find(j => j.id.toString() === selectedJobId);
        const quantityChanged = original && Number(editableJob.quantity) !== Number(original.quantity);
        const payload = {
            priority: editableJob.priority,
            due_date: editableJob.due_date,
            release_date: editableJob.release_date,
            ...(quantityChanged
                ? { quantity: Number(editableJob.quantity), operations: [] }
                : { operations: editableJob.operations })
        };
        try {
            await axios.put(`${API_BASE}/dataset/job/${editableJob.id}`, payload);
            await fetchInfo();
            alert(quantityChanged
                ? 'Swapped Quantity: exec time has changed!'
                : 'Update successfuly!');
            if (onDataChanged) onDataChanged();
        } catch (error) {
            alert(error.response?.data?.message || 'erorr!');
            console.error(error);
        }
    };

    const handleExportExcel = () => {
        if (!info) return;
        const exportData = [];
        info.jobs.forEach(job => {
            job.operations.forEach(op => {
                exportData.push({
                    'Order ID': job.code,
                    'Product': job.product_code,
                    'F_Product': job.family_code,
                    'Quantity': job.quantity,
                    'Priority': job.priority,
                    'Release': new Date(job.release_date).toLocaleString(),
                    'Due Date': new Date(job.due_date).toLocaleString(),
                    'Step': op.step,
                    'Machine': op.machine,
                    'Time running - min': op.time
                });
            });
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "LichTrinhSanXuat");
        XLSX.writeFile(workbook, "DuLieuSanXuat_Export.xlsx");
    };

    const updateOperation = (stepIdx, field, value) => {
        const newJob = { ...editableJob };
        newJob.operations[stepIdx][field] = Number(value);
        setEditableJob(newJob);
    };


    if (!info) return <div className="placeholder-content">Đang tải...</div>;
    if (info.numJobs === 0) return <div className="placeholder-content">No data, Import file?</div>;

    const inputStyle = { width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' };
    const thStyle = { padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1', color: '#333' };

    return (
        <div className="quadrant" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '15px' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    style={{ flex: 1, padding: '8px', borderRadius: '4px' }}
                >
                    {info.jobs.map(job => (
                        <option key={job.id} value={job.id}>{job.code}</option>
                    ))}
                </select>
                <button onClick={handleSaveAndReschedule} style={{ padding: '8px 15px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Save & Run
                </button>
                <button onClick={handleExportExcel} style={{ padding: '8px 15px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Export
                </button>
            </div>

            {editableJob && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '10px', padding: '10px', background: '#34495e', color: 'white', borderRadius: '4px' }}>
                        <div>
                            <strong>Product: </strong>
                            {editableJob.product_code} ({editableJob.family_code}) × {editableJob.quantity}
                        </div>
                        <div>
                            <strong>Quantity: </strong>
                            <input type="number" min="1" value={editableJob.quantity}
                                onChange={(e) => setEditableJob({ ...editableJob, quantity: Number(e.target.value) })}
                                style={{ ...inputStyle, width: '80px' }} />
                        </div>
                        <div>
                            <strong>Priority: </strong>
                            <select value={editableJob.priority} onChange={(e) => setEditableJob({...editableJob, priority: Number(e.target.value)})} style={{ padding: '4px' }}>
                                <option value={1}>1 - Normal</option>
                                <option value={2}>2 - High</option>
                                <option value={3}>3 - Urgent</option>
                            </select>
                        </div>
                        <div>
                            <strong>Release: </strong>
                            <input type="datetime-local"
                                value={toLocalInput(editableJob.release_date)}
                                onChange={(e) => setEditableJob({...editableJob, release_date: e.target.value})}
                                style={{ padding: '4px' }}
                            />
                        </div>
                        <div>
                            <strong>Due date: </strong>
                            <input type="datetime-local"
                                value={toLocalInput(editableJob.due_date)}
                                onChange={(e) => setEditableJob({...editableJob, due_date: e.target.value})}
                                style={{ padding: '4px' }}
                            />
                        </div>
                    </div>

                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Step</th>
                                    <th style={thStyle}>Machine</th>
                                    <th style={thStyle}>Processing time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {editableJob.operations.map((op, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #444' }}>
                                        <td style={{ padding: '8px' }}>{op.step}</td>
                                        <td style={{ padding: '8px' }}>{op.machine}</td>
                                        <td style={{ padding: '8px' }}>
                                            <input type="number" min="1" style={inputStyle} value={op.time} onChange={(e) => updateOperation(idx, 'time', e.target.value)} />
                                        </td>
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