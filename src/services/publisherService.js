const logModel = require('../models/logModel');
const scheduleModel = require('../models/scheduleModel');

// Códigos de error que indican que el destino ya no es válido
const FATAL_ERRORS = [
  'bot was kicked',
  'bot is not a member',
  'chat not found',
  'user is deactivated',
  'chat was deleted',
  'CHAT_WRITE_FORBIDDEN',
];

function isFatalError(err) {
  const msg = (err.message || '').toLowerCase();
  return FATAL_ERRORS.some((f) => msg.includes(f.toLowerCase()));
}

module.exports = {
  async publish(bot, schedule) {
    let success = 0;
    let failed = 0;
    let fatals = 0;

    for (const chatId of schedule.targets) {
      try {
        await bot.telegram.sendMessage(chatId, schedule.content);
        logModel.log(schedule.id, chatId, 'success');
        success++;
      } catch (err) {
        const fatal = isFatalError(err);
        logModel.log(
          schedule.id,
          chatId,
          fatal ? 'fatal' : 'failed',
          err.message
        );
        console.error(
          `❌ Envío fallido a ${chatId} (${fatal ? 'FATAL' : 'temporal'}):`,
          err.message
        );
        if (fatal) {
          fatals++;
          // Eliminar este target del schedule para no reintentar
          scheduleModel.removeTarget(schedule.id, chatId);
        }
        failed++;
      }
    }

    return { success, failed, fatals };
  },
};