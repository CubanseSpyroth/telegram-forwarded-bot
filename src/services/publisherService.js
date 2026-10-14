const logModel = require('../models/logModel');
const scheduleModel = require('../models/scheduleModel');
const { parseButtonsJson } = require('../utils/buttonBuilder');

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

    const replyMarkup = parseButtonsJson(schedule.buttons_json);
    const parseMode = schedule.parse_mode || 'MarkdownV2';

    for (const chatId of schedule.targets) {
      try {
        if (schedule.media_type === 'photo' && schedule.media_file_id) {
          await bot.telegram.sendPhoto(chatId, schedule.media_file_id, {
            caption: schedule.content,
            parse_mode: parseMode,
            reply_markup: replyMarkup || undefined,
          });
        } else {
          await bot.telegram.sendMessage(chatId, schedule.content, {
            parse_mode: parseMode,
            reply_markup: replyMarkup || undefined,
          });
        }

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
          scheduleModel.removeTarget(schedule.id, chatId);
        }
        failed++;
      }
    }

    return { success, failed, fatals };
  },
};