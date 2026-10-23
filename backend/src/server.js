const express = require('express');
const cors = require('cors');

const app = express();
// CORS_ORIGIN: comma-separated allowlist in production; unset = allow all (demo)
const CORS_ORIGIN = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '5mb' }));

// liveness probe for the Render health check
app.get('/healthz', (req, res) => res.json({ ok: true, service: 'mes-aps-backend' }));


app.use('/api', require('./routes/schedule'));
app.use('/api', require('./routes/reschedule'));
app.use('/api', require('./routes/dataset'));
app.use('/api', require('./routes/master'));
app.use('/api', require('./routes/audit'));

app.use((req, res) => res.status(404).json({ message: 'Not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API Server running at http://localhost:${PORT}`);
});