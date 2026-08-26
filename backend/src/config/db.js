const { Pool } = require('pg');

// local development database connection
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mes_aps',
    password: '123123',
    port: 5432,
});

module.exports = pool;