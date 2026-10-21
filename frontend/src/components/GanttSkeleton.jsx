import React from 'react';

// Shown while the schedule is being computed. Mimics the real Gantt card
// (header, time axis, machine rows, zoom slider) so the page does not jump when data arrives.
// Bar positions are fixed [left%, width%] so they do not flicker between renders.
const ROWS = [
    [[4, 22], [30, 18], [56, 26]],
    [[10, 16], [34, 30], [70, 14]],
    [[0, 28], [34, 14], [52, 20], [78, 12]],
    [[18, 20], [44, 24], [74, 16]],
    [[6, 12], [26, 26], [60, 22]],
    [[14, 26], [46, 12], [66, 24]]
];
const AXIS_TICKS = 8;

const GanttSkeleton = () => (
    <div className="quadrant skel-card" role="status" aria-busy="true" aria-label="Scheduling in progress">
        <div className="skel-head">
            <div className="skel-head-text">
                <span className="skel-shimmer skel-line" style={{ width: 190, height: 16 }} />
                <span className="skel-shimmer skel-line" style={{ width: '55%', height: 10 }} />
            </div>
            <span className="skel-status">Processing…</span>
        </div>

        <div className="skel-body">
            <div className="skel-axis">
                <span className="skel-gutter" />
                <div className="skel-axis-ticks">
                    {Array.from({ length: AXIS_TICKS }, (_, i) => (
                        <span key={i} className="skel-shimmer skel-tick" />
                    ))}
                </div>
            </div>

            <div className="skel-rows">
                {ROWS.map((bars, i) => (
                    <div key={i} className="skel-row">
                        <span className="skel-gutter"><span className="skel-shimmer skel-label" /></span>
                        <div className="skel-track">
                            {bars.map(([left, width], j) => (
                                <span key={j} className="skel-shimmer skel-bar"
                                      style={{ left: `${left}%`, width: `${width}%` }} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="skel-slider">
                <span className="skel-gutter" />
                <span className="skel-shimmer skel-slider-bar" />
            </div>
        </div>
    </div>
);
export default GanttSkeleton;