const channelService = require('../services/channelService');
const channelModel = require('../models/channelModel');

module.exports = (bot) => {
  // ---------- /addchannel ----------
  bot.command('addchannel', async (ctx) => {
    const text = ctx.message.text.replace('/addchannel', '').trim();
    if (!text) {
      ctx.session.awaiting = 'addchannel';
      return ctx.reply(
        '📢 Envíame el @username o el ID numérico del canal/grupo.\n\n' +
          'Ejemplos:\n' +
          '• `@mi_canal_publico`\n' +
          '• `-1001234567890`\n\n' +
          '⚠️ Recuerda añadirme como administrador con permiso para publicar.',
        { parse_mode: 'Markdown' }
      );
    }
    await handleAddChannel(bot, ctx, text);
  });

  // ---------- /channels (con botones) ----------
  bot.command('channels', async (ctx) => {
    await showChannelsList(ctx);
  });

  // ---------- Callbacks ----------
  bot.action(/^ch:view:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const channel = channelModel.findById(id);

    if (!channel || channel.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ Canal no encontrado');
    }

    await ctx.editMessageText(
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
              { text: '✏️ Editar nombre', callback_data: `ch:edit:${id}` },
              { text: '🗑 Borrar', callback_data: `ch:del:${id}` },
            ],
            [{ text: '⬅️ Volver', callback_data: 'ch:back' }],
          ],
        },
      }
    );
    await ctx.answerCbQuery();
  });

  bot.action(/^ch:del:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const channel = channelModel.findById(id);
    if (!channel || channel.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ Canal no encontrado');
    }

    await ctx.editMessageText(
      `⚠️ ¿Seguro que quieres borrar el canal *${escapeMd(channel.title || channel.chat_id)}*?\n\n` +
        `Se eliminarán también las publicaciones asociadas.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Sí, borrar', callback_data: `ch:delok:${id}` },
              { text: '❌ Cancelar', callback_data: `ch:view:${id}` },
            ],
          ],
        },
      }
    );
    await ctx.answerCbQuery();
  });

  bot.action(/^ch:delok:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const channel = channelModel.findById(id);
    if (!channel || channel.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ Canal no encontrado');
    }

    channelModel.deleteById(id);
    await ctx.answerCbQuery('🗑 Canal eliminado');
    await showChannelsList(ctx, true);
  });

  bot.action(/^ch:edit:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const channel = channelModel.findById(id);
    if (!channel || channel.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ Canal no encontrado');
    }

    ctx.session.editingChannel = id;
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `✏️ Envíame el *nuevo título* para el canal.\n\n` +
        `Actual: \`${channel.title || channel.chat_id}\`\n\n` +
        `(El \`chat_id\` no cambia, solo el nombre mostrado)`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.action('ch:back', async (ctx) => {
    await ctx.answerCbQuery();
    await showChannelsList(ctx, true);
  });

  // ---------- Captura de texto (addchannel / edit channel) ----------
  bot.use(async (ctx, next) => {
    if (!ctx.message?.text) return next();

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
};

// ---------- Helpers ----------

async function handleAddChannel(bot, ctx, rawInput) {
  try {
    const channel = await channelService.addChannel(bot, ctx.state.user, rawInput);
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
    ? `📢 *Tus canales:*\n\nSelecciona uno para gestionarlo.`
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
    await ctx.editMessageText(text, opts);
  } else {
    await ctx.reply(text, opts);
  }
}

function escapeMd(str = '') {
  return String(str).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}