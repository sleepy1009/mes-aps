import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

/*

BUG DATA CHANGE IN FRONTEND DO NOT REFLECT IN BACKEND DATABASE, NEED TO RELOAD DATASET TO SEE CHANGES


*/

const JobDetails = ({ refreshTrigger, onDataChanged }) => {
    const [info, setInfo] = useState(null);
    const [selectedJobId, setSelectedJobId] = useState('');
    const [editableJob, setEditableJob] = useState(null);

    useEffect(() => {
        const fetchInfo = async () => {
            try {
                const res = await axios.get('http://localhost:3000/api/dataset/info');
                setInfo(res.data);
                if (res.data.jobs.length > 0) {
                    setSelectedJobId(res.data.jobs[0].id.toString());
                }
            } catch (err) {
                console.error("Error fetching job information:", err);
            }
        };
        fetchInfo();
    }, [refreshTrigger]);

    useEffect(() => {
        if (info && selectedJobId) {
            const job = info.jobs.find(j => j.id.toString() === selectedJobId);
            setEditableJob(job ? JSON.parse(JSON.stringify(job)) : null);
        }
    }, [info, selectedJobId]);


    const handleSaveAndReschedule = async () => {
        if (!editableJob) return;
        try {
            await axios.put(`http://localhost:3000/api/dataset/job/${editableJob.id}`, {
                priority: editableJob.priority,
                due_date: editableJob.due_date,
                operations: editableJob.operations
            });
            alert('Cập nhật dữ liệu thành công!');
            if (onDataChanged) onDataChanged();
        } catch (error) {
            alert('Lỗi khi lưu dữ liệu!');
            console.error(error);
        }
    };

    const handleExportExcel = () => {
        if (!info) return;
        const exportData = [];
        info.jobs.forEach(job => {
            job.operations.forEach(op => {
                exportData.push({
                    'Mã Đơn': job.code,
                    'Độ Ưu Tiên (Priority)': job.priority,
                    'Hạn Giao (Due Date)': new Date(job.due_date).toLocaleString(),
                    'Nguyên Công (Step)': op.step,
                    'Máy (Machine)': op.machine,
                    'TG Chạy (phút)': op.time,
                    'TG Setup (phút)': op.setup
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


    if (!info) return <div className="placeholder-content">Loading...</div>;
    if (info.numJobs === 0) return <div className="placeholder-content">no date yet, import data?</div>;

    const inputStyle = { width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' };
    const thStyle = { padding: '8px', textAlign: 'left', borderBottom: '2px solid #ddd', background: '#ecf0f1', color: '#333' };

    return (
        <div className="quadrant" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                Quản lý Master Data
            </h3>
            
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
                    Lưu & Lập Lịch Lại
                </button>
                <button onClick={handleExportExcel} style={{ padding: '8px 15px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Xuất Excel
                </button>
            </div>

            {editableJob && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '10px', padding: '10px', background: '#34495e', color: 'white', borderRadius: '4px' }}>
                        <div>
                            <strong>Priority: </strong>
                            <select value={editableJob.priority} onChange={(e) => setEditableJob({...editableJob, priority: Number(e.target.value)})} style={{ padding: '4px' }}>
                                <option value={1}>1 - Bình thường</option>
                                <option value={2}>2 - Cao</option>
                                <option value={3}>3 - Khẩn cấp</option>
                            </select>
                        </div>
                        <div>
                            <strong>Due Date: </strong>
                            <input type="datetime-local" 
                                value={new Date(editableJob.due_date).toISOString().slice(0, 16)} 
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
                                    <th style={thStyle}>Máy</th>
                                    <th style={thStyle}>TG Chạy (phút)</th>
                                    <th style={thStyle}>TG Setup (phút)</th>
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
                                        <td style={{ padding: '8px' }}>
                                            <input type="number" min="0" style={inputStyle} value={op.setup} onChange={(e) => updateOperation(idx, 'setup', e.target.value)} />
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