const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mes_aps',
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
    // plant local time: dates typed without a time zone are read as Vietnam time
    options: '-c TimeZone=Asia/Ho_Chi_Minh',
});

module.exports = pool;