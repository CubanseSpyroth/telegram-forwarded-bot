const { PLANS } = require('../config/constants');
const userModel = require('../models/userModel');
const paymentModel = require('../models/paymentModel');
const planService = require('./planService');

module.exports = {
  /**
   * Construye el payload de la factura para identificar el plan comprado.
   * Formato: plan:<nombre>:<userId>:<timestamp>
   */
  buildPayload(planName, userId) {
    return `plan:${planName}:${userId}:${Date.now()}`;
  },

  /**
   * Parsea el payload y devuelve { planName, userId }.
   */
  parsePayload(payload) {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== 'plan') {
      throw new Error('Payload inválido');
    }
    return { planName: parts[1], userId: Number(parts[2]) };
  },

  /**
   * Verifica si el plan existe y tiene precio > 0.
   */
  isValidPlan(planName) {
    const plan = PLANS[planName];
    return plan && plan.priceStars > 0;
  },

  /**
   * Aplica el pago: actualiza el plan del usuario y guarda el registro.
   */
  applyPayment({ userId, planName, chargeId, amountStars }) {
    const plan = PLANS[planName];
    if (!plan) throw new Error('Plan no válido');

    // Calcular fecha de expiración
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

    // Actualizar usuario
    userModel.updatePlan(userId, planName, expiresAt.toISOString());

    // Registrar pago
    paymentModel.create({
      userId,
      chargeId,
      amount: amountStars,
      plan: planName,
      durationDays: plan.durationDays,
    });

    return { planName, expiresAt };
  },
};