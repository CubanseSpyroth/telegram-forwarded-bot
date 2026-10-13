const db = require('../database/connection');

module.exports = {
  create({ userId, chargeId, amount, plan, durationDays }) {
    return db.prepare(`
      INSERT INTO payments 
        (user_id, telegram_payment_charge_id, amount, plan, duration_days)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, chargeId, amount, plan, durationDays);
  },

  findByChargeId(chargeId) {
    return db.prepare(
      'SELECT * FROM payments WHERE telegram_payment_charge_id = ?'
    ).get(chargeId);
  },

  getByUser(userId) {
    return db.prepare(
      'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId);
  },
};