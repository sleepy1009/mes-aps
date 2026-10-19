// Main features shown as buttons under the Gantt chart.
// `group`: features with the same group REPLACE each other (opening one closes the other).
//          group = null -> independent, can stay open together with anything.
// To change which buttons swap, edit only the `group` values below.
export const FEATURES = [
    { id: 'master',     en: 'Master data',  vi: '',   group: 'data' },
    { id: 'routing',    en: 'Routing',      vi: '',   group: 'data' },
    { id: 'kpi',        en: 'KPI',          vi: '',   group: null },
    { id: 'compare',    en: 'Compare runs', vi: '',   group: null },
    { id: 'machines',   en: 'Machines',     vi: '',   group: 'ops' },
    { id: 'reschedule', en: 'Reschedule',   vi: '',   group: 'ops' },
    { id: 'audit',      en: 'Audit log',    vi: '',   group: null }
];

// click an open button -> close it; click a closed one -> open it and close its group rivals
export function togglePanel(open, id, features = FEATURES) {
    if (open.includes(id)) return open.filter((x) => x !== id);
    const f = features.find((x) => x.id === id);
    if (!f) return open;
    const rivals = f.group ? features.filter((x) => x.group === f.group && x.id !== id).map((x) => x.id) : [];
    return [...open.filter((x) => !rivals.includes(x)), id];
}