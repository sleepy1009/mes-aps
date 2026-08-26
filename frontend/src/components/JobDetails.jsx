import React, { useState, useEffect } from 'react';
import axios from 'axios';

const JobDetails = ({ refreshTrigger }) => {
    const [info, setInfo] = useState(null);
    const [selectedJobId, setSelectedJobId] = useState('');

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

    if (!info) return <div className="placeholder-content">Loading...</div>;
    if (info.numJobs === 0) return <div className="placeholder-content">no date yet, import data?</div>;

    const selectedJob = info.jobs.find(j => j.id.toString() === selectedJobId);

    const thStyle = { padding: '10px 8px', textAlign: 'left', borderBottom: '2px solid #ddd', position: 'sticky', top: 0, background: '#ecf0f1', color: '#333' };
    const tdStyle = { padding: '8px', textAlign: 'left', borderBottom: '1px solid #444' };

    return (
        <div className="quadrant" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #ddd', paddingBottom: '10px', color: '#2c3e50' }}>
                Job Details
            </h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', padding: '10px', backgroundColor: '#34495e', borderRadius: '5px', color: 'white' }}>
                <div><strong>Total Machines:</strong> {info.numMachines}</div>
                <div><strong>Total Jobs:</strong> {info.numJobs}</div>
            </div>

            <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontWeight: 'bold' }}>Check Job:</label>
                <select 
                    value={selectedJobId} 
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', flex: 1, backgroundColor: '#fff', color: '#000' }}
                >
                    {info.jobs.map(job => (
                        <option key={job.id} value={job.id}>
                            {job.code} - Priority: {job.priority === 3 ? 'Urgent (P3)' : job.priority === 2 ? 'High (P2)' : 'Normal (P1)'}
                        </option>
                    ))}
                </select>
            </div>

            {selectedJob && (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: '#ecf0f1', borderRadius: '4px' }}>
                        <div style={{ color: '#27ae60', fontWeight: 'bold' }}>
                            Total time (Pi): {selectedJob.pi_time} minutes
                        </div>
                        <div style={{ color: '#e74c3c', fontWeight: 'bold' }}>
                            Due Date: {new Date(selectedJob.due_date).toLocaleString()}
                        </div>
                    </div>
                    
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #444', borderRadius: '4px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Step</th>
                                    <th style={thStyle}>Machine</th>
                                    <th style={thStyle}>Run Time (min)</th>
                                    <th style={thStyle}>Setup Time (min)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedJob.operations.map((op, idx) => (
                                    <tr key={idx}>
                                        <td style={tdStyle}>{op.step}</td>
                                        <td style={tdStyle}>Machine {op.machine}</td>
                                        <td style={tdStyle}>{op.time}</td>
                                        <td style={tdStyle}>{op.setup}</td>
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