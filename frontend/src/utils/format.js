const pad = (n) => String(n).padStart(2, '0');

// Same format as the Gantt axis: dd/mm HH:mm
export const fmtDateTime = (value) => {
    if (value == null || value === '') return '-';
    const d = new Date(value);
    if (isNaN(d)) return '-';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 1500 -> "1d 1h", 95 -> "1h 35m", 0 or NaN -> "-"
export const fmtDuration = (min) => {
    if (!Number.isFinite(min) || min <= 0) return '-';
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = Math.round(min % 60);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m';
};