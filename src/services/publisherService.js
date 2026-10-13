const logModel = require('../models/logModel');

module.exports = {
  /**
   * Envía el contenido de un schedule a todos sus destinos.
   * Devuelve { success, failed }.
   */
  async publish(bot, schedule) {
    let success = 0;
    let failed = 0;

    for (const chatId of schedule.targets) {
      try {
        await bot.telegram.sendMessage(chatId, schedule.content);
        logModel.log(schedule.id, chatId, 'success');
        success++;
      } catch (err) {
        console.error(
          `❌ Fallo enviando schedule #${schedule.id} a ${chatId}:`,
          err.message
        );
        logModel.log(schedule.id, chatId, 'failed', err.message);
        failed++;
      }
    }

    return { success, failed };
  },
};