const db = require('../database/connection');

module.exports = {
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  create({ id, username, firstName }) {
    const stmt = db.prepare(`
      INSERT INTO users (id, username, first_name)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name
    `);
    stmt.run(id, username || null, firstName || null);
    return this.findById(id);
  },

  updatePlan(userId, plan, expiresAt = null) {
    db.prepare(`
      UPDATE users SET plan = ?, plan_expires = ? WHERE id = ?
    `).run(plan, expiresAt, userId);
    return this.findById(userId);
  },

  getAll() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  },
};