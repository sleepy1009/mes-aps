const pool = require('../config/db');

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// PostgreSQL data/constraint errors -> 400, rest -> 500
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        if (err instanceof HttpError) {
            return res.status(err.status).json({ message: err.message, error: err.message });
        }
        if (err.code && /^(22|23)/.test(err.code)) {
            return res.status(400).json({ message: err.message, error: err.message });
        }
        console.error(err);
        res.status(500).json({ message: err.message, error: err.message });
    }
};

async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// audit trail: who changed what (default user_A for test, dev for role later)
async function audit(client, action, entityType, entityId, payload) {
    await client.query(
        `INSERT INTO AuditLogs (UserId, Action, EntityType, EntityId, Payload)
         VALUES ('User_A', $1, $2, $3, $4)`,
        [action, entityType, entityId, JSON.stringify(payload || {})]
    );
}

const toMinutes = (date, base) => Math.round((new Date(date) - base) / 60000);

// GA budget for real runs. Setup times make the search harder than the LA benchmark (setup = 0),
// so this is larger than the engine default (50 x 1000): about 0.5 s per run, tournament 2 keeps diversity.
const ENGINE_DEFAULTS = { PopulationSize: 100, MaxGenerations: 3000, TournamentSize: 2 };
const ENGINE_LIMITS = [
    ['populationSize', 'PopulationSize', 2, 1000],
    ['maxGenerations', 'MaxGenerations', 1, 50000],
    ['tournamentSize', 'TournamentSize', 1, 20]
];

// KPIs of the last stored run before beforeRunId (null = the latest run), for before/after comparison
async function loadPreviousKpis(beforeRunId) {
    const { rows } = await pool.query(`
        SELECT Id AS id, CreatedAt AS created_at, Result->'kpis' AS kpis
        FROM ScheduleRuns
        WHERE Result <> '{}'::jsonb AND ($1::int IS NULL OR Id < $1)
        ORDER BY Id DESC LIMIT 1
    `, [beforeRunId]);
    return rows.length ? { runId: rows[0].id, createdAt: rows[0].created_at, kpis: rows[0].kpis } : null;
}

module.exports = { HttpError, handle, withTransaction, audit, toMinutes, ENGINE_DEFAULTS, ENGINE_LIMITS, loadPreviousKpis };