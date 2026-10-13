const scheduleModel = require('../models/scheduleModel');
const publisherService = require('../services/publisherService');
const { calculateNextRun } = require('../utils/dateHelpers');
const { SCHEDULE_TYPES } = require('../config/constants');

module.exports = {
  async run(bot, schedule) {
    console.log(`⏰ Ejecutando schedule #${schedule.id} ("${truncate(schedule.content)}")`);

    // 1. Enviar
    const { success, failed } = await publisherService.publish(bot, schedule);
    console.log(`   → ${success} OK / ${failed} fallidos`);

    // 2. Recalcular o desactivar
    try {
      if (schedule.schedule_type === SCHEDULE_TYPES.ONCE) {
        // Una vez: se apaga tras enviarse
        scheduleModel.deactivate(schedule.id);
        console.log(`   → Schedule #${schedule.id} desactivado (once).`);
      } else {
        // Diaria/semanal/mensual: calcular la próxima
        const next = calculateNextRun(schedule, new Date());
        scheduleModel.updateNextRun(schedule.id, next.toISOString());
        console.log(`   → Próxima ejecución: ${next.toISOString()}`);
      }
    } catch (err) {
      // Si falla el cálculo, mejor desactivar para no loopear
      console.error(`   ❌ Error recalculando next_run de #${schedule.id}:`, err.message);
      scheduleModel.deactivate(schedule.id);
    }
  },
};

function truncate(str, n = 30) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}