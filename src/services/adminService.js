const userModel = require('../models/userModel');
const channelModel = require('../models/channelModel');
const scheduleModel = require('../models/scheduleModel');
const paymentModel = require('../models/paymentModel');
const { PLANS } = require('../config/constants');

module.exports = {
  /**
   * Estadísticas generales del bot.
   */
  getStats() {
    const users = userModel.count();
    const channels = require('../database/connection')
      .prepare('SELECT COUNT(*) AS total FROM channels').get().total;
    const schedules = require('../database/connection')
      .prepare('SELECT COUNT(*) AS total FROM schedules WHERE is_active = 1').get().total;
    const payments = require('../database/connection')
      .prepare('SELECT COUNT(*) AS total, SUM(amount) AS stars FROM payments').get();
    const logs = require('../database/connection')
      .prepare('SELECT COUNT(*) AS total FROM delivery_logs').get().total;

    // Usuarios por plan
    const byPlan = require('../database/connection')
      .prepare(`
        SELECT plan, COUNT(*) AS total FROM users GROUP BY plan
      `).all();

    return {
      users,
      channels,
      schedules,
      payments: payments.total || 0,
      stars: payments.stars || 0,
      logs,
      byPlan,
    };
  },

  /**
   * Da un plan manualmente a un usuario.
   */
  givePlan(userId, planName, days = 30) {
    if (!PLANS[planName]) throw new Error('Plan no válido');

    const user = userModel.findById(userId);
    if (!user) throw new Error('Usuario no encontrado');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    userModel.updatePlan(userId, planName, expiresAt.toISOString());
    return { userId, planName, expiresAt };
  },

  /**
   * Lista de usuarios con paginación.
   */
  listUsers(offset = 0, limit = 10) {
    const db = require('../database/connection');
    const users = db.prepare(`
      SELECT id, username, first_name, plan, created_at
      FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;

    return { users, total, offset, limit };
  },

  /**
   * Reembolsa un pago con Stars.
   * Requiere user_id y telegram_payment_charge_id.
   */
  async refundPayment(bot, userId, chargeId) {
    const payment = paymentModel.findByChargeId(chargeId);
    if (!payment) throw new Error('Pago no encontrado');

    // Llamada a la API de Telegram
    await bot.telegram.callApi('refundStarPayment', {
      user_id: userId,
      telegram_payment_charge_id: chargeId,
    });

    // Degradar al usuario a free si tenía ese plan
    userModel.updatePlan(userId, 'free', null);

    return { userId, chargeId, amount: payment.amount };
  },
};