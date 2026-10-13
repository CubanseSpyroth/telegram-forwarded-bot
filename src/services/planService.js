const { PLANS } = require('../config/constants');

module.exports = {
  getPlan(planName) {
    return PLANS[planName] || PLANS.free;
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