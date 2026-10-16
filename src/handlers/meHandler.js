// src/handlers/meHandler.js
const planService = require('../services/planService');
const scheduleModel = require('../models/scheduleModel');
const channelModel = require('../models/channelModel');

module.exports = (bot) => {
  bot.command('me', handleMeCommand);

  // Callback de /start
  bot.action('start:me', async (ctx) => {
    await ctx.answerCbQuery();
    return handleMeCommand(ctx);
  });
};

async function handleMeCommand(ctx) {
  const user = ctx.state.user;
  const plan = planService.getPlan(user.plan);
  const channelsUsed = channelModel.countByUser(user.id);
  const schedulesUsed = scheduleModel.countByUser(user.id);

  return ctx.reply(
    `👤 *Tu cuenta*\n\n` +
      `🆔 ID: \`${user.id}\`\n` +
      `📛 Nombre: ${user.first_name || '—'}\n` +
      `🔗 Usuario: ${user.username ? '@' + user.username : '—'}\n\n` +
      `💼 *Plan:* ${plan.label}\n\n` +
      `📊 *Uso:*\n` +
      `• Canales: ${channelsUsed} / ${plan.maxChannels}\n` +
      `• Publicaciones: ${schedulesUsed} / ${plan.maxSchedules}\n` +
      `• Destinos por publicación: ${plan.maxTargetsPerSchedule}`,
    { parse_mode: 'Markdown' }
  );
}

module.exports.handleMeCommand = handleMeCommand;