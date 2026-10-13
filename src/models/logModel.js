const db = require('../database/connection');

module.exports = {
  log(scheduleId, chatId, status, error = null) {
    db.prepare(`
      INSERT INTO delivery_logs (schedule_id, chat_id, status, error)
      VALUES (?, ?, ?, ?)
    `).run(scheduleId, chatId, status, error);
  },

  getBySchedule(scheduleId, limit = 20) {
    return db.prepare(`
      SELECT * FROM delivery_logs
      WHERE schedule_id = ?
      ORDER BY sent_at DESC
      LIMIT ?
    `).all(scheduleId, limit);
  },

  deleteOlderThan(days) {
  return db.prepare(`
    DELETE FROM delivery_logs
    WHERE sent_at < datetime('now', ?)
    `).run(`-${days} days`);
  },

  count() {
    return db.prepare('SELECT COUNT(*) AS total FROM delivery_logs').get().total;
  },  
};