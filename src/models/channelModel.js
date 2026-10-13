const db = require('../database/connection');

module.exports = {
  create({ userId, chatId, title, type }) {
    const stmt = db.prepare(`
      INSERT INTO channels (user_id, chat_id, title, type)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, chat_id) DO UPDATE SET
        title = excluded.title,
        type = excluded.type
    `);
    stmt.run(userId, chatId, title || null, type || null);
    return this.findByUserAndChat(userId, chatId);
  },

  findByUserAndChat(userId, chatId) {
    return db.prepare(
      'SELECT * FROM channels WHERE user_id = ? AND chat_id = ?'
    ).get(userId, chatId);
  },

  getByUser(userId) {
    return db.prepare(
      'SELECT * FROM channels WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  },

  countByUser(userId) {
    return db.prepare(
      'SELECT COUNT(*) AS total FROM channels WHERE user_id = ?'
    ).get(userId).total;
  },

  delete(userId, chatId) {
    return db.prepare(
      'DELETE FROM channels WHERE user_id = ? AND chat_id = ?'
    ).run(userId, chatId);
  },
  findByUserAndChat(userId, chatId) {
    return db.prepare(
      'SELECT * FROM channels WHERE user_id = ? AND chat_id = ?'
    ).get(userId, chatId);
  },

  // src/models/channelModel.js
  findById(id) {
    return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  },

  updateTitle(id, title) {
    return db.prepare('UPDATE channels SET title = ? WHERE id = ?').run(title, id);
  },

  deleteById(id) {
    return db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  },

  countByUser(userId) {
    return db.prepare(
      'SELECT COUNT(*) AS total FROM channels WHERE user_id = ?'
    ).get(userId).total;
  },

};