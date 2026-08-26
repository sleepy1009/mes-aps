import React, { useState } from 'react';
import GanttChart from './components/GanttChart';
import { fetchSchedule, uploadDataset } from './services/api';
import './index.css';
import JobDetails from './components/JobDetails';

function App() {
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [refreshDataset, setRefreshDataset] = useState(0);

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                setLoading(true);
                const text = e.target.result;
                const lines = text.trim().split('\n');
                
                const [numJobs, numMachines] = lines[0].trim().split(/\s+/).map(Number);
                const operations = [];

                // Parse JSSP
                for (let i = 1; i <= numJobs; i++) {
                    const row = lines[i].trim().split(/\s+/).map(Number);
                    for (let j = 0; j < numMachines * 2; j += 2) {
                        operations.push({
                            jobId: i,
                            machineId: row[j] + 1, // LA start with 0 -> 1-based
                            time: row[j + 1],
                            step: (j / 2) + 1
                        });
                    }
                }

                // send JSON to backend to reset DB
                await uploadDataset({ numJobs, numMachines, operations });
                alert('loading data successfully.');
                setRefreshDataset(prev => prev + 1);
            } catch (err) {
                setError('error:' + err.message);
            } finally {
                setLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleRunSchedule = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchSchedule();
            setSchedules(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Server error!');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-frame">
            <div className="header-controls">
                <div>
                    <h2 style={{ margin: 0, color: '#3498db' }}>APS Core Engine</h2>
                    <span style={{ fontSize: '12px', color: '#888' }}>Upload JSSP Dataset & Run</span>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <label className="btn btn-upload">
                        📂 Tải lên File LA (.txt)
                        <input type="file" accept=".txt" hidden onChange={handleFileUpload} />
                    </label>
                    <button className="btn btn-run" onClick={handleRunSchedule} disabled={loading}>
                        {loading ? 'in process...' : 'Run'}
                    </button>
                </div>
            </div>

            {error && <div style={{ color: '#ff6b6b', background: '#332222', padding: '10px', borderRadius: '5px' }}>{error}</div>}

            <div className="dashboard-grid">
                {schedules.length > 0 && !loading ? (
                    <GanttChart data={schedules} />
                ) : (
                    <div className="quadrant">
                        <div className="placeholder-content"> x </div>
                    </div>
                )}

                <JobDetails refreshTrigger={refreshDataset} />

                <div className="quadrant">
                    <div className="placeholder-content"> x </div>
                </div>

                <div className="quadrant">
                    <div className="placeholder-content"> x </div>
                </div>
            </div>
        </div>
    );
}

export default App;