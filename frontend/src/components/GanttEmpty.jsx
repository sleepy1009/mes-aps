import React from 'react';

const Key = ({ children }) => <kbd className="gantt-empty-key">{children}</kbd>;

const STEPS = [
    { title: 'Import', text: <>Click <Key>📂 Import</Key> to load orders from CSV/Excel. Need the format? Use <Key>⬇ Template</Key>.</> },
    { title: 'Run', text: <>Click <Key>▶ Run</Key> to let the GA engine build the schedule.</> },
    { title: 'Review', text: <>The Resource Gantt appears here. Use the feature buttons below to tune and compare.</> }
];

const GanttEmpty = () => (
    <div className="gantt-empty" role="status">
        <svg className="gantt-empty-icon" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
            <rect x="4" y="9" width="20" height="7" rx="2" fill="currentColor" />
            <rect x="18" y="21" width="24" height="7" rx="2" fill="currentColor" opacity=".7" />
            <rect x="8" y="33" width="16" height="7" rx="2" fill="currentColor" opacity=".45" />
        </svg>
        <h3 className="gantt-empty-title">No schedule yet</h3>
        <p className="gantt-empty-sub">Follow these steps to see the Resource Gantt chart.</p>
        <ol className="gantt-empty-steps">
            {STEPS.map((s, i) => (
                <li key={s.title} className="gantt-empty-step">
                    <span className="gantt-empty-num">{i + 1}</span>
                    <div>
                        <b>{s.title}</b>
                        <span>{s.text}</span>
                    </div>
                </li>
            ))}
        </ol>
    </div>
);
export default GanttEmpty;