import React from 'react';

const Header = ({ onRun, loading }) => (
    <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={{ color: '#2c3e50' }}>🏭 Hệ Thống Lập Lịch Sản Xuất Nâng Cao (APS)</h1>
        <p style={{ color: '#7f8c8d' }}>Core Engine: C++ | Backend: Node.js | Database: PostgreSQL</p>
        
        <button 
            onClick={onRun} 
            disabled={loading}
            style={{
                padding: '12px 24px',
                fontSize: '16px',
                backgroundColor: loading ? '#95a5a6' : '#2980b9',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                marginTop: '10px'
            }}
        >
            {loading ? 'in process (C++ Engine)...' : 'Run Schedule'}
        </button>
    </header>
);

export default Header;