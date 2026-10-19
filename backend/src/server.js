const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

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