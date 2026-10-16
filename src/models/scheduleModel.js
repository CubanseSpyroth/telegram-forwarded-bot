// src/models/scheduleModel.js
const db = require('../database/connection');

// ============================================================
// CREATE
// ============================================================

function create(schedule) {
  const stmt = db.prepare(`
    INSERT INTO schedules (
      user_id, content,
      schedule_type, hour, minute, weekday, day_of_month, run_date,
      next_run, is_active,
      media_type, media_file_id, parse_mode, buttons_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
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
    schedule.next_run,
    schedule.media_type ?? null,
    schedule.media_file_id ?? null,
    schedule.parse_mode ?? null,
    schedule.buttons_json ?? null
  );

  return result.lastInsertRowid;
}

// ============================================================
// READ
// ============================================================

function findById(id) {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
}

function getByUser(userId) {
  return db
    .prepare('SELECT * FROM schedules WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

function countByUser(userId) {
  return db
    .prepare(
      'SELECT COUNT(*) AS total FROM schedules WHERE user_id = ? AND is_active = 1'
    )
    .get(userId).total;
}

/**
 * Devuelve los schedules activos cuya next_run <= ahora.
 * Añade los targets a cada schedule.
 */
function getDue(nowIso) {
  const schedules = db
    .prepare(`
      SELECT * FROM schedules
      WHERE is_active = 1
        AND next_run IS NOT NULL
        AND next_run <= ?
    `)
    .all(nowIso);

  const getTargetsStmt = db.prepare(
    'SELECT chat_id FROM schedule_targets WHERE schedule_id = ?'
  );

  return schedules.map((s) => ({
    ...s,
    targets: getTargetsStmt.all(s.id).map((t) => t.chat_id),
  }));
}

// ============================================================
// UPDATE — Estado general
// ============================================================

function toggleActive(id, isActive) {
  return db
    .prepare('UPDATE schedules SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, id);
}

function updateNextRun(id, nextRunIso) {
  return db
    .prepare(`
      UPDATE schedules
      SET next_run = ?, last_run = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(nextRunIso, id);
}

// ============================================================
// UPDATE — Campos editables
// ============================================================

function updateContent(id, content) {
  return db
    .prepare('UPDATE schedules SET content = ? WHERE id = ?')
    .run(content, id);
}

function updateMedia(id, mediaType, mediaFileId) {
  return db
    .prepare(
      'UPDATE schedules SET media_type = ?, media_file_id = ? WHERE id = ?'
    )
    .run(mediaType, mediaFileId, id);
}

function updateButtons(id, buttonsJson) {
  return db
    .prepare('UPDATE schedules SET buttons_json = ? WHERE id = ?')
    .run(buttonsJson, id);
}

function updateParseMode(id, parseMode) {
  return db
    .prepare('UPDATE schedules SET parse_mode = ? WHERE id = ?')
    .run(parseMode, id);
}

function updateType(id, type) {
  return db
    .prepare('UPDATE schedules SET schedule_type = ? WHERE id = ?')
    .run(type, id);
}

function updateTime(id, hour, minute) {
  return db
    .prepare('UPDATE schedules SET hour = ?, minute = ? WHERE id = ?')
    .run(hour, minute, id);
}

function updateRunDate(id, runDateIso, hour, minute) {
  return db
    .prepare(
      'UPDATE schedules SET run_date = ?, hour = ?, minute = ? WHERE id = ?'
    )
    .run(runDateIso, hour, minute, id);
}

function updateWeekday(id, weekday) {
  return db
    .prepare('UPDATE schedules SET weekday = ? WHERE id = ?')
    .run(weekday, id);
}

function updateDayOfMonth(id, dayOfMonth) {
  return db
    .prepare('UPDATE schedules SET day_of_month = ? WHERE id = ?')
    .run(dayOfMonth, id);
}

// ============================================================
// DELETE
// ============================================================

function remove(id) {
  return db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

// ============================================================
// TARGETS
// ============================================================

function addTarget(scheduleId, chatId) {
  return db
    .prepare('INSERT INTO schedule_targets (schedule_id, chat_id) VALUES (?, ?)')
    .run(scheduleId, chatId);
}

function getTargets(scheduleId) {
  return db
    .prepare('SELECT chat_id FROM schedule_targets WHERE schedule_id = ?')
    .all(scheduleId)
    .map((t) => t.chat_id);
}

function removeTarget(scheduleId, chatId) {
  return db
    .prepare(
      'DELETE FROM schedule_targets WHERE schedule_id = ? AND chat_id = ?'
    )
    .run(scheduleId, chatId);
}

/**
 * Reemplaza todos los targets de un schedule.
 * Operación atómica (transacción).
 */
function setTargets(scheduleId, chatIds) {
  const del = db.prepare('DELETE FROM schedule_targets WHERE schedule_id = ?');
  const ins = db.prepare(
    'INSERT INTO schedule_targets (schedule_id, chat_id) VALUES (?, ?)'
  );

  const tx = db.transaction((id, ids) => {
    del.run(id);
    for (const chatId of ids) ins.run(id, chatId);
  });

  return tx(scheduleId, chatIds);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // CREATE
  create,

  // READ
  findById,
  getByUser,
  countByUser,
  getDue,

  // UPDATE — estado
  toggleActive,
  updateNextRun,

  // UPDATE — campos
  updateContent,
  updateMedia,
  updateButtons,
  updateParseMode,
  updateType,
  updateTime,
  updateRunDate,
  updateWeekday,
  updateDayOfMonth,

  // DELETE
  delete: remove,

  // TARGETS
  addTarget,
  getTargets,
  removeTarget,
  setTargets,
};