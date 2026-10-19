import React, { useEffect, useState } from 'react';
import axios from 'axios';
const API_BASE = 'http://localhost:3000/api';

const RoutingDiagram = () => {
    const [products, setProducts] = useState([]);
    const [selected, setSelected] = useState('');

    useEffect(() => {
        axios.get(`${API_BASE}/products`)
            .then(res => {
                setProducts(res.data);
                if (res.data.length > 0) setSelected(res.data[0].code);
            })
            .catch(() => {});
    }, []);

    const current = products.find(p => p.code === selected);
    const routing = current ? [...(current.routing || [])].sort((a, b) => a.step - b.step) : [];

    return (
        <div className="quadrant" style={{ padding: 15, overflowY: 'auto' }}>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#666' }}>
                explain...
            </p>
            <div style={{ marginBottom: 12 }}>
                <label>Product: </label>
                <select value={selected} onChange={e => setSelected(e.target.value)}
                    style={{ padding: 6, borderRadius: 4, border: '1px solid #ccc' }}>
                    {products.map(p => <option key={p.id} value={p.code}>{p.code} - {p.name} ({p.family_code})</option>)}
                </select>
            </div>

            {current && (
                <div style={{ padding: '10px 0' }}>
                    <div style={{ fontSize: 14, marginBottom: 10 }}>
                        <b>{current.code}</b> - {current.name} <span style={{ color: '#888' }}>(Family: {current.family_code})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        {routing.map((step, idx) => (
                            <React.Fragment key={step.step}>
                                <div style={{
                                    background: '#3498db', color: '#fff', padding: '8px 12px', borderRadius: 6,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)', minWidth: 100, textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: 11, opacity: 0.8 }}>Step {step.step}</div>
                                    <div style={{ fontWeight: 'bold', fontSize: 14 }}>{step.machine}</div>
                                    <div style={{ fontSize: 11, marginTop: 2 }}>{step.cycle_time} min/sp</div>
                                </div>
                                {idx < routing.length - 1 && (
                                    <div style={{ color: '#95a5a6', fontSize: 24, fontWeight: 'bold' }}>→</div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                    {routing.length === 0 && <div style={{ color: '#e74c3c' }}>Product dont have Routing.</div>}
                </div>
            )}
        </div>
    );
};
export default RoutingDiagram;