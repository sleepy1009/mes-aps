import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

export const fetchSchedule = async () => {
    const response = await axios.post(`${API_BASE}/schedule/run`);
    return response.data.data;
};

export const uploadDataset = async (payload) => {
    const response = await axios.post(`${API_BASE}/dataset/import`, payload);
    return response.data;
};