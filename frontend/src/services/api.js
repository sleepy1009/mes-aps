import axios from 'axios';

// Local dev without .env -> localhost:3000. Hosted -> VITE_API_BASE (Vercel env, baked at build time).
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000/api';

axios.defaults.timeout = 180000;

export const fetchSchedule = async (payload = {}) => (await axios.post(`${API_BASE}/schedule/run`, payload)).data;
export const fetchLatest = async () => (await axios.get(`${API_BASE}/schedule/latest`)).data;
export const importCsv = async (payload) => (await axios.post(`${API_BASE}/dataset/import-csv`, payload)).data;
export const fetchDatasetInfo = async () => (await axios.get(`${API_BASE}/dataset/info`)).data;
export const listRuns = async () => (await axios.get(`${API_BASE}/runs`)).data;
export const compareRuns = async (runA, runB) => (await axios.get(`${API_BASE}/schedule/compare`, { params: { runA, runB } })).data;
export const listDowntimes = async () => (await axios.get(`${API_BASE}/downtimes`)).data;
export const addDowntime = async (payload) => (await axios.post(`${API_BASE}/downtimes`, payload)).data;
export const deleteDowntime = async (id) => (await axios.delete(`${API_BASE}/downtimes/${id}`)).data;
export const updateMachineRate = async (id, rate) => (await axios.put(`${API_BASE}/machines/${id}/rate`, { rate })).data;
export const fetchRunKpis = async (runId) => (await axios.get(`${API_BASE}/runs/${runId}/kpis`)).data;
export const fetchRunResult = async (runId) => (await axios.get(`${API_BASE}/runs/${runId}/result`)).data;
export const reschedule = async (payload) => (await axios.post(`${API_BASE}/schedule/reschedule`, payload)).data;
export const listAudit = async () => (await axios.get(`${API_BASE}/audit`)).data;