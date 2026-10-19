import React, { useEffect, useState } from 'react';
import { togglePanel } from '../utils/panels';
import '../dock.css';

// Toolbar of feature buttons + the panels that are open. Panels are mounted only while open,
// so each one reloads fresh data every time it is opened.
const FeatureDock = ({ features, renderPanel, badges = {} }) => {
    const [open, setOpen] = useState([]);
    const [cols, setCols] = useState(1);
    const [justOpened, setJustOpened] = useState(null);

    const toggle = (id) => {
        const next = togglePanel(open, id, features);
        setJustOpened(next.includes(id) && !open.includes(id) ? id : null);
        setOpen(next);
    };
    useEffect(() => {
        if (!justOpened) return;
        const el = document.getElementById(`panel-${justOpened}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [justOpened]);

    const visible = features.filter((f) => open.includes(f.id));
    return (
        <>
            <div className="dock-toolbar">
                {features.map((f, i) => {
                    const next = features[i + 1];
                    const swaps = f.group && next && next.group === f.group;
                    return (
                        <React.Fragment key={f.id}>
                            <button className={`dock-btn${open.includes(f.id) ? ' active' : ''}`} onClick={() => toggle(f.id)}>
                                <div className="en">
                                    {f.en}{badges[f.id] ? <span className="dock-badge">{badges[f.id]}</span> : null}
                                </div>
                                <div className="vi">{f.vi}</div>
                            </button>
                            {swaps && <span className="dock-swap" title="Hai nút này thay thế nhau: mở nút này sẽ đóng nút kia">⇄</span>}
                        </React.Fragment>
                    );
                })}
                <span className="dock-spacer" />
                <div className="dock-tools">
                    <span>Layout:</span>
                    <button className={`dock-mini${cols === 1 ? ' active' : ''}`} onClick={() => setCols(1)}>1 col</button>
                    <button className={`dock-mini${cols === 2 ? ' active' : ''}`} onClick={() => setCols(2)}>2 cols</button>
                    <button className="dock-mini" onClick={() => setOpen([])} disabled={open.length === 0}>Close all</button>
                </div>
            </div>
            {visible.length === 0 ? (
                <div className="dock-hint">
                    Select one feature to open table, button connect ⇄ for swap table, rest open single.
                </div>
            ) : (
                <div className="dock-grid" style={{ gridTemplateColumns: cols === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
                    {visible.map((f) => (
                        <section key={f.id} id={`panel-${f.id}`} className="dock-panel">
                            <div className="dock-panel-bar">
                                <span>{f.en}<small>{f.vi}</small></span>
                                <button onClick={() => toggle(f.id)} title="Close">✕</button>
                            </div>
                            <div className="dock-panel-body">{renderPanel(f.id)}</div>
                        </section>
                    ))}
                </div>
            )}
        </>
    );
};
export default FeatureDock;