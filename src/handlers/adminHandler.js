const { Telegraf } = require('telegraf');
const { adminOnly } = require('../middlewares/adminMiddleware');
const adminService = require('../services/adminService');
const userModel = require('../models/userModel');
const { PLANS } = require('../config/constants');
const { escapeMd } = require('../utils/stringHelpers');

module.exports = (bot) => {
  // ============================================================
  // /admin — Menú principal de admin
  // ============================================================
  bot.command('admin', adminOnly, async (ctx) => {
    return ctx.reply(
      `🛠 *Panel de administración*\n\n` +
        `/stats — Ver estadísticas del bot\n` +
        `/users — Listar usuarios\n` +
        `/giveplan <userId> <plan> [días] — Dar plan manual\n` +
        `/broadcast <mensaje> — Enviar a todos los usuarios\n` +
        `/refund <userId> <chargeId> — Reembolsar pago Stars\n` +
        `/userinfo <userId> — Ver info de un usuario`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // /stats — Estadísticas generales
  // ============================================================
  bot.command('stats', adminOnly, async (ctx) => {
    const stats = adminService.getStats();

    const byPlanText = stats.byPlan
      .map((p) => `  • ${PLANS[p.plan]?.label || p.plan}: ${p.total}`)
      .join('\n');

    return ctx.reply(
      `📊 *Estadísticas del bot*\n\n` +
        `👥 Usuarios: ${stats.users}\n` +
        `📢 Canales: ${stats.channels}\n` +
        `📝 Publicaciones activas: ${stats.schedules}\n` +
        `💳 Pagos: ${stats.payments}\n` +
        `⭐ Stars recaudados: ${stats.stars}\n` +
        `📜 Envíos registrados: ${stats.logs}\n\n` +
        `*Usuarios por plan:*\n${byPlanText}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // /users — Listar usuarios (paginado)
  // ============================================================
  bot.command('users', adminOnly, async (ctx) => {
    const args = ctx.message?.text?.split(' ') || [];
    const offset = parseInt(args[1], 10) || 0;

    const { users, total } = adminService.listUsers(offset, 10);

    const lines = users.map((u) => {
      const name = escapeMd(u.first_name || '—');
      const username = u.username ? `@${escapeMd(u.username)}` : '—';
      const plan = escapeMd(u.plan || 'free');
      return `• \`${u.id}\` — ${name} (${username}) — ${plan}`;
    });

    const nav = [];
    if (offset > 0) {
      nav.push({ text: '⬅️ Anterior', callback_data: `admin:users:${offset - 10}` });
    }
    if (offset + 10 < total) {
      nav.push({ text: 'Siguiente ➡️', callback_data: `admin:users:${offset + 10}` });
    }

    return ctx.reply(
      `👥 *Usuarios* (${offset + 1}-${Math.min(offset + 10, total)} de ${total})\n\n` +
        lines.join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: nav.length ? [nav] : [] },
      }
    );
  });

  // Callback de paginación
  bot.action(/^admin:users:(\d+)$/, async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from?.id)) {
      return ctx.answerCbQuery('❌ No autorizado');
    }

    const offset = parseInt(ctx.match[1], 10);
    const { users, total } = adminService.listUsers(offset, 10);

    const lines = users.map((u) => {
      const name = escapeMd(u.first_name || '—');
      const username = u.username ? `@${escapeMd(u.username)}` : '—';
      const plan = escapeMd(u.plan || 'free');
      return `• \`${u.id}\` — ${name} (${username}) — ${plan}`;
    });

    const nav = [];
    if (offset > 0) {
      nav.push({ text: '⬅️ Anterior', callback_data: `admin:users:${offset - 10}` });
    }
    if (offset + 10 < total) {
      nav.push({ text: 'Siguiente ➡️', callback_data: `admin:users:${offset + 10}` });
    }

    await safeEdit(
      ctx,
      `👥 *Usuarios* (${offset + 1}-${Math.min(offset + 10, total)} de ${total})\n\n` +
        lines.join('\n'),
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: nav.length ? [nav] : [] },
      }
    );
    await ctx.answerCbQuery();
  });

  // ============================================================
  // /userinfo <id> — Info detallada de un usuario
  // ============================================================
  bot.command('userinfo', adminOnly, async (ctx) => {
    const args = ctx.message.text.split(' ');
    const userId = parseInt(args[1], 10);
    if (isNaN(userId)) return ctx.reply('Uso: /userinfo <userId>');

    const user = userModel.findById(userId);
    if (!user) return ctx.reply('❌ Usuario no encontrado');

    const db = require('../database/connection');
    const channels = db.prepare('SELECT COUNT(*) AS c FROM channels WHERE user_id = ?').get(userId).c;
    const schedules = db.prepare('SELECT COUNT(*) AS c FROM schedules WHERE user_id = ? AND is_active = 1').get(userId).c;

    return ctx.reply(
      `👤 *Usuario ${user.id}*\n\n` +
      `Nombre: ${escapeMd(user.first_name || '—')}\n` +
      `Username: ${user.username ? '@' + escapeMd(user.username) : '—'}\n` +
      `Plan: ${escapeMd(user.plan)}\n` +
      `Expira: ${user.plan_expires ? new Date(user.plan_expires).toLocaleDateString() : '—'}\n` +
      `Registrado: ${new Date(user.created_at).toLocaleDateString()}\n\n` +
      `📢 Canales: ${channels}\n` +
      `📝 Publicaciones: ${schedules}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // /giveplan <userId> <plan> [días]
  // ============================================================
  bot.command('giveplan', adminOnly, async (ctx) => {
    const args = ctx.message.text.split(' ');
    const userId = parseInt(args[1], 10);
    const planName = args[2];
    const days = parseInt(args[3], 10) || 30;

    if (isNaN(userId) || !planName) {
      return ctx.reply(
        `Uso: /giveplan <userId> <plan> [días]\n\n` +
          `Planes: free, basic, premium\n` +
          `Ejemplo: /giveplan 123456789 premium 60`
      );
    }

    try {
      const result = adminService.givePlan(userId, planName, days);
      return ctx.reply(
        `✅ Plan aplicado\n\n` +
          `👤 Usuario: \`${result.userId}\`\n` +
          `💼 Plan: ${PLANS[result.planName].label}\n` +
          `📅 Expira: ${result.expiresAt.toLocaleDateString()}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      return ctx.reply(`❌ ${err.message}`);
    }
  });

  // ============================================================
  // /broadcast <mensaje> — Enviar a todos los usuarios
  // ============================================================
  bot.command('broadcast', adminOnly, async (ctx) => {
    const text = ctx.message.text.replace('/broadcast', '').trim();
    if (!text) return ctx.reply('Uso: /broadcast <mensaje>');

    const db = require('../database/connection');
    const users = db.prepare('SELECT id FROM users').all();

    // Confirmar antes de enviar
    ctx.session.pendingBroadcast = text;
    return ctx.reply(
      `⚠️ *Confirmar broadcast*\n\n` +
        `Se enviará a *${users.length}* usuarios:\n\n` +
        `_${text.slice(0, 200)}${text.length > 200 ? '…' : ''}_\n\n` +
        `¿Confirmas?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Enviar', callback_data: 'admin:broadcast:send' },
              { text: '❌ Cancelar', callback_data: 'admin:broadcast:cancel' },
            ],
          ],
        },
      }
    );
  });

  bot.action('admin:broadcast:cancel', async (ctx) => {
    if (!require('../config/env').ADMIN_IDS.includes(ctx.from.id)) {
      return ctx.answerCbQuery('❌ No autorizado');
    }
    ctx.session.pendingBroadcast = null;
    await ctx.editMessageText('❌ Broadcast cancelado.');
    await ctx.answerCbQuery();
  });

  bot.action('admin:broadcast:send', async (ctx) => {
    if (!require('../config/env').ADMIN_IDS.includes(ctx.from.id)) {
      return ctx.answerCbQuery('❌ No autorizado');
    }

    const text = ctx.session.pendingBroadcast;
    if (!text) {
      await ctx.answerCbQuery('❌ No hay broadcast pendiente');
      return;
    }
    ctx.session.pendingBroadcast = null;

    const db = require('../database/connection');
    const users = db.prepare('SELECT id FROM users').all();

    await ctx.answerCbQuery('📤 Enviando…');
    await ctx.editMessageText(`📤 Enviando broadcast a ${users.length} usuarios…`);

    let ok = 0;
    let fail = 0;

    // Throttling: 30 msg/s máximo [citation:18]
    for (const u of users) {
      try {
        await bot.telegram.sendMessage(u.id, text);
        ok++;
      } catch (err) {
        fail++;
        // Usuario bloqueó el bot → no es error crítico
        if (err.response?.error_code === 403) continue;
      }
      // Esperar ~35ms entre mensajes (~28 msg/s)
      await new Promise((r) => setTimeout(r, 35));
    }

    await ctx.editMessageText(
      `✅ Broadcast completado\n\n` +
        `📤 Enviados: ${ok}\n` +
        `❌ Fallidos: ${fail}`
    );
  });

  // ============================================================
  // /refund <userId> <chargeId> — Reembolsar pago Stars
  // ============================================================
  bot.command('refund', adminOnly, async (ctx) => {
    const args = ctx.message.text.split(' ');
    const userId = parseInt(args[1], 10);
    const chargeId = args[2];

    if (isNaN(userId) || !chargeId) {
      return ctx.reply('Uso: /refund <userId> <chargeId>');
    }

    try {
      const result = await adminService.refundPayment(ctx.telegram, userId, chargeId);
      return ctx.reply(
        `✅ Reembolso procesado\n\n` +
          `👤 Usuario: \`${result.userId}\`\n` +
          `💰 Stars: ${result.amount} ⭐\n` +
          `🔑 Charge ID: \`${result.chargeId}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      return ctx.reply(`❌ Error en reembolso: ${err.message}`);
    }
  });
};