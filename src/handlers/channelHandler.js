// src/handlers/channelHandler.js
const channelService = require('../services/channelService');
const channelModel = require('../models/channelModel');
const { escapeMd } = require('../utils/stringHelpers');

// ============================================================
// EXPORT PRINCIPAL
// ============================================================

module.exports = (bot) => {
  // ⚠️ Pasamos `bot` a cada registro que lo necesita
  registerCommands(bot);
  registerActions(bot);
  registerTextCapture(bot);
};

// ============================================================
// COMANDOS
// ============================================================

function registerCommands(bot) {
  bot.command('addchannel', (ctx) => handleAddChannelCommand(bot, ctx));
  bot.command('channels', (ctx) => showChannelsList(ctx));
}

async function handleAddChannelCommand(bot, ctx) {
  const text = (ctx.message?.text || '').replace('/addchannel', '').trim();

  if (text) {
    return handleAddChannel(bot, ctx, text);
  }

  ctx.session.awaiting = 'addchannel';
  return ctx.reply(
    '📢 Envíame el @username o el ID numérico del canal/grupo.\n\n' +
      'Ejemplos:\n' +
      '• `@mi_canal_publico`\n' +
      '• `-1001234567890`\n\n' +
      '⚠️ Recuerda añadirme como admin y ser tú administrador del canal.',
    { parse_mode: 'Markdown' }
  );
}

// ============================================================
// ACCIONES
// ============================================================

function registerActions(bot) {
  bot.action('start:addchannel', async (ctx) => {
    await ctx.answerCbQuery();
    return handleAddChannelCommand(bot, ctx);
  });

  bot.action(/^ch:view:(\d+)$/, onViewChannel);
  bot.action(/^ch:del:(\d+)$/, onDeleteConfirm);
  bot.action(/^ch:delok:(\d+)$/, onDeleteConfirmYes);
  bot.action(/^ch:edit:(\d+)$/, onEditStart);
  bot.action('ch:back', async (ctx) => {
    await ctx.answerCbQuery();
    await showChannelsList(ctx, true);
  });
}

async function onViewChannel(ctx) {
  const channel = await findUserChannel(ctx);
  if (!channel) return;

  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `📢 *${escapeMd(channel.title || channel.chat_id)}*\n\n` +
      `🆔 \`${channel.chat_id}\`\n` +
      `📁 Tipo: ${channel.type}\n` +
      `📅 Añadido: ${new Date(channel.created_at).toLocaleDateString()}\n\n` +
      `¿Qué quieres hacer?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✏️ Editar nombre', callback_data: `ch:edit:${channel.id}` },
            { text: '🗑 Borrar', callback_data: `ch:del:${channel.id}` },
          ],
          [{ text: '⬅️ Volver', callback_data: 'ch:back' }],
        ],
      },
    }
  );
}

async function onDeleteConfirm(ctx) {
  const channel = await findUserChannel(ctx);
  if (!channel) return;

  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `⚠️ ¿Seguro que quieres borrar el canal *${escapeMd(channel.title || channel.chat_id)}*?\n\n` +
      `Se eliminarán también las publicaciones asociadas.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Sí, borrar', callback_data: `ch:delok:${channel.id}` },
            { text: '❌ Cancelar', callback_data: `ch:view:${channel.id}` },
          ],
        ],
      },
    }
  );
}

async function onDeleteConfirmYes(ctx) {
  const channel = await findUserChannel(ctx);
  if (!channel) return;

  channelModel.deleteById(channel.id);
  await ctx.answerCbQuery('🗑 Canal eliminado');
  await showChannelsList(ctx, true);
}

async function onEditStart(ctx) {
  const channel = await findUserChannel(ctx);
  if (!channel) return;

  ctx.session.editingChannel = channel.id;
  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `✏️ Envíame el *nuevo título* para el canal.\n\n` +
      `Actual: \`${escapeMd(channel.title || channel.chat_id)}\`\n\n` +
      `(El \`chat_id\` no cambia, solo el nombre mostrado)`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancelar', callback_data: `ch:view:${channel.id}` }],
        ],
      },
    }
  );
}

// ============================================================
// CAPTURA DE TEXTO
// ============================================================

function registerTextCapture(bot) {
  bot.use(async (ctx, next) => {
    if (!ctx.message?.text || ctx.message?.photo) return next();

    // Editar canal
    if (ctx.session?.editingChannel) {
      const id = ctx.session.editingChannel;
      ctx.session.editingChannel = null;
      const title = ctx.message.text.trim();

      channelModel.updateTitle(id, title);
      return ctx.reply(`✅ Nombre actualizado a *${escapeMd(title)}*`, {
        parse_mode: 'Markdown',
      });
    }

    // Añadir canal
    if (ctx.session?.awaiting === 'addchannel') {
      ctx.session.awaiting = null;
      return handleAddChannel(bot, ctx, ctx.message.text.trim());
    }

    return next();
  });
}

// ============================================================
// HANDLERS COMPARTIDOS
// ============================================================

async function handleAddChannel(bot, ctx, rawInput) {
  try {
    const channel = await channelService.addChannel(
      bot,                    // ⬅️ aquí el bot real
      ctx.state.user,
      rawInput
    );
    return ctx.reply(
      `✅ Canal añadido:\n\n*${escapeMd(channel.title)}*\n\`${channel.chat_id}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    return ctx.reply(`❌ ${err.message}`);
  }
}

async function showChannelsList(ctx, edit = false) {
  const list = channelModel.getByUser(ctx.state.user.id);

  const text = list.length
    ? '📢 *Tus canales:*\n\nSelecciona uno para gestionarlo.'
    : '📭 No tienes canales registrados.\nUsa /addchannel para añadir uno.';

  const keyboard = list.map((c) => [
    {
      text: `📢 ${c.title || c.chat_id}`,
      callback_data: `ch:view:${c.id}`,
    },
  ]);

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  };

  if (edit && ctx.callbackQuery) {
    return safeEdit(ctx, text, opts);
  }
  return ctx.reply(text, opts);
}

// ============================================================
// HELPERS
// ============================================================

async function findUserChannel(ctx) {
  const id = Number(ctx.match[1]);
  const channel = channelModel.findById(id);

  if (!channel || channel.user_id !== ctx.state.user.id) {
    await ctx.answerCbQuery('❌ Canal no encontrado');
    return null;
  }
  return channel;
}

async function safeEdit(ctx, text, options = {}) {
  try {
    await ctx.editMessageText(text, options);
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      console.error('Error editando mensaje:', err.message);
    }
  }
}

// ============================================================
// EXPORTS ADICIONALES
// ============================================================

module.exports.handleAddChannelCommand = handleAddChannelCommand;
module.exports.showChannelsList = showChannelsList;