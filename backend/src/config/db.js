const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

// local dev without .env -> localhost; hosted -> Supabase DIRECT connection (SSL required)
const host = process.env.DB_HOST || 'localhost';
const isLocal = host === 'localhost' || host === '127.0.0.1';

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host,
    database: process.env.DB_NAME || 'mes_aps',
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
    // plant local time: dates typed without a time zone are read as Vietnam time.
    // REQUIRES a direct Supabase connection: the transaction pooler drops session GUCs.
    options: '-c TimeZone=Asia/Ho_Chi_Minh',
    max: Number(process.env.DB_POOL_MAX) || 5,
    ssl: isLocal ? undefined : { rejectUnauthorized: false } // Supabase requires SSL; demo-grade TLS
});

module.exports = pool;