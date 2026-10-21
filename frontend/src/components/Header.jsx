import React, { useRef } from 'react';

// Top-level toolbar: title, subtitle, and the 3 primary actions.
// All handlers and state stay in App; Header only renders and calls callbacks.
const Header = ({ onTemplate, onImport, onRun, loading }) => {
    const fileRef = useRef(null);
    const triggerImport = () => fileRef.current && fileRef.current.click();
    const handleFile = (e) => {
        const file = e.target.files[0];
        if (file) onImport(file);
        e.target.value = ''; // allow re-uploading the same file
    };

    return (
        <div className="header-controls">
            <div>
                <h2 className="header-title">APS Core Engine</h2>
            </div>
            <div className="header-actions">
                <button className="btn btn-upload" onClick={onTemplate} title="Download the CSV/Excel import template">
                    ⬇ Template
                </button>
                <button className="btn btn-upload" onClick={triggerImport} title="Import orders from CSV/Excel">
                    📂 Import
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    hidden
                    onChange={handleFile}
                />
                <button className="btn btn-run" onClick={onRun} disabled={loading} title="Run the GA scheduler">
                    {loading ? 'Running…' : '▶ Run'}
                </button>
            </div>
        </div>
    );
};
export default Header;