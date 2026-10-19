const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { handle } = require('./_helper');

// UI
router.get('/audit', handle(async (req, res) => {
    const raw = Number(req.query.limit) || 100;
    const limit = Math.min(500, Math.max(1, raw));
    const { rows } = await pool.query(`
        SELECT Id AS id, UserId AS user_id, Action AS action, EntityType AS entity_type,
               EntityId AS entity_id, Payload AS payload, CreatedAt AS created_at
        FROM AuditLogs ORDER BY Id DESC LIMIT $1`, [limit]);
    res.json(rows);
}));

module.exports = router;