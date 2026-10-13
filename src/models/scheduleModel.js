const db = require('../database/connection');

module.exports = {
  create(schedule) {
    const stmt = db.prepare(`
      INSERT INTO schedules
        (user_id, content, schedule_type, hour, minute, weekday, day_of_month,
         run_date, next_run, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const result = stmt.run(
      schedule.user_id,
      schedule.content,
      schedule.schedule_type,
      schedule.hour,
      schedule.minute,
      schedule.weekday ?? null,
      schedule.day_of_month ?? null,
      schedule.run_date ?? null,
      schedule.next_run
    );
    return result.lastInsertRowid;
  },

  findById(id) {
    return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  },

  getByUser(userId) {
    return db.prepare(
      'SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  },

  countByUser(userId) {
    return db.prepare(
      'SELECT COUNT(*) AS total FROM schedules WHERE user_id = ? AND is_active = 1'
    ).get(userId).total;
  },

  /**
   * Schedules que deben ejecutarse ahora (next_run <= now).
   */
  getDue(nowIso) {
    const schedules = db.prepare(`
      SELECT * FROM schedules
      WHERE is_active = 1 AND next_run IS NOT NULL AND next_run <= ?
    `).all(nowIso);

    const getTargets = db.prepare(
      'SELECT chat_id FROM schedule_targets WHERE schedule_id = ?'
    );

    return schedules.map((s) => ({
      ...s,
      targets: getTargets.all(s.id).map((t) => t.chat_id),
    }));
  },

  updateNextRun(id, nextRun) {
    db.prepare(`
      UPDATE schedules
      SET next_run = ?, last_run = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextRun, id);
  },

  toggleActive(id, isActive) {
    db.prepare('UPDATE schedules SET is_active = ? WHERE id = ?')
      .run(isActive ? 1 : 0, id);
  },

  deactivate(id) {
    db.prepare('UPDATE schedules SET is_active = 0 WHERE id = ?').run(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  },

  // --- Targets ---
  addTarget(scheduleId, chatId) {
    db.prepare(
      'INSERT INTO schedule_targets (schedule_id, chat_id) VALUES (?, ?)'
    ).run(scheduleId, chatId);
  },

  getTargets(scheduleId) {
    return db.prepare(
      'SELECT chat_id FROM schedule_targets WHERE schedule_id = ?'
    ).all(scheduleId).map((t) => t.chat_id);
  },

  updateContent(id, content) {
    return db.prepare('UPDATE schedules SET content = ? WHERE id = ?').run(content, id);
  },
};