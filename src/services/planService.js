const { PLANS } = require('../config/constants');

module.exports = {
  getPlan(planName) {
  return PLANS[planName] || PLANS.free;
},

/**
 * Devuelve el plan efectivo del usuario (respeta expiración).
 */
getEffectivePlan(user) {
  if (!user.plan_expires) return this.getPlan(user.plan);

  const expires = new Date(user.plan_expires);
  if (expires < new Date()) {
    // Plan expirado → degradar a free
    return PLANS.free;
  }
  return this.getPlan(user.plan);
},
  

  /**
   * Devuelve un resumen del plan y uso actual.
   */
  summarize(user, usage) {
    const plan = this.getPlan(user.plan);
    return {
      plan,
      usage,
      isExpired:
        user.plan_expires && new Date(user.plan_expires) < new Date(),
    };
  },
};