const db = require('./db');

function logAction({ userId, systemId, action, success, output }) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, system_id, action, success, output) VALUES (?, ?, ?, ?, ?)`
  ).run(userId ?? null, systemId ?? null, action, success ? 1 : 0, output ?? null);
}

module.exports = { logAction };
