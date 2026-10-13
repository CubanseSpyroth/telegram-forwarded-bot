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
};