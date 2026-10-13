// src/handlers/postHandler.js
const scheduleService = require('../services/scheduleService');
const scheduleModel = require('../models/scheduleModel');
const logModel = require('../models/logModel');
const channelModel = require('../models/channelModel');
const { SCHEDULE_TYPES } = require('../config/constants');
const { formatDate, WEEKDAYS } = require('../utils/dateHelpers');

const STEPS = {
  CONTENT: 'content',
  TARGETS: 'targets',
  TYPE: 'type',
  TIME: 'time',
  WEEKDAY: 'weekday',
  DAY_OF_MONTH: 'day_of_month',
  RUN_DATE: 'run_date',
  CONFIRM: 'confirm',
};

module.exports = (bot) => {
  // ============================================================
  // COMANDO /newpost — Flujo conversacional
  // ============================================================
  bot.command('newpost', async (ctx) => {
    const channels = channelModel.getByUser(ctx.state.user.id);
    if (!channels.length) {
      return ctx.reply(
        '⚠️ No tienes canales registrados.\nUsa /addchannel primero.'
      );
    }

    ctx.session.post = {};
    ctx.session.step = STEPS.CONTENT;

    return ctx.reply(
      '📝 *Nueva publicación*\n\n' +
        'Paso 1/5: Envíame el *contenido* del mensaje.\n\n' +
        'Escribe /cancel para cancelar en cualquier momento.',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // COMANDO /posts — Lista con botones
  // ============================================================
  bot.command('posts', async (ctx) => {
    await showPostsList(ctx);
  });

  // ============================================================
  // COMANDO /cancel — Salir del flujo
  // ============================================================
  bot.command('cancel', async (ctx) => {
    ctx.session.post = null;
    ctx.session.step = null;
    ctx.session.editingPostId = null;
    return ctx.reply('❌ Operación cancelada.');
  });

  // ============================================================
  // CALLBACKS DE BOTONES
  // ============================================================

  // --- Ver detalle ---
  bot.action(/^po:view:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    const targets = scheduleModel.getTargets(id);
    const status = s.is_active ? '🟢 Activa' : '⏸ Pausada';
    const typeLabel = {
      once: 'Una vez',
      daily: 'Diaria',
      weekly: 'Semanal',
      monthly: 'Mensual',
    }[s.schedule_type];

    const text =
      `📝 *Publicación #${s.id}*\n\n` +
      `Estado: ${status}\n` +
      `Tipo: ${typeLabel}\n` +
      `Destinos: ${targets.length}\n` +
      `Próxima: ${s.next_run ? formatDate(s.next_run) : '—'}\n\n` +
      `Contenido:\n_${escapeMd(s.content)}_`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: buildPostKeyboard(s, id),
    });
    await ctx.answerCbQuery();
  });

  // --- Pausar ---
  bot.action(/^po:pause:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    scheduleModel.toggleActive(id, false);
    const updated = scheduleModel.findById(id);
    await ctx.answerCbQuery('⏸ Pausada');
    await refreshPostView(ctx, updated);
  });

  // --- Reanudar ---
  bot.action(/^po:resume:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    scheduleModel.toggleActive(id, true);
    const updated = scheduleModel.findById(id);
    await ctx.answerCbQuery('▶️ Reactivada');
    await refreshPostView(ctx, updated);
  });

  // --- Borrar (confirmar) ---
  bot.action(/^po:del:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    await ctx.editMessageText(
      `⚠️ ¿Seguro que quieres borrar la publicación *#${id}*?\n\n` +
        `_${escapeMd(s.content.slice(0, 80))}${s.content.length > 80 ? '…' : ''}_\n\n` +
        `Esta acción no se puede deshacer.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Sí, borrar', callback_data: `po:delok:${id}` },
              { text: '❌ Cancelar', callback_data: `po:view:${id}` },
            ],
          ],
        },
      }
    );
    await ctx.answerCbQuery();
  });

  // --- Borrar (ejecutar) ---
  bot.action(/^po:delok:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    scheduleModel.delete(id);
    await ctx.answerCbQuery('🗑 Eliminada');
    await showPostsList(ctx, true);
  });

  // --- Editar contenido ---
  bot.action(/^po:edit:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    ctx.session.editingPostId = id;
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `✏️ Envíame el *nuevo contenido* para la publicación *#${id}*.\n\n` +
        `Actual:\n_${escapeMd(s.content)}_\n\n` +
        `Escribe /cancel para cancelar.`,
      { parse_mode: 'Markdown' }
    );
  });

  // --- Ver log ---
  bot.action(/^po:log:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    const logs = logModel.getBySchedule(id, 10);
    const text = logs.length
      ? `📜 *Últimos envíos de #${id}*\n\n` +
        logs
          .map((l) => {
            const icon = l.status === 'success' ? '✅' : '❌';
            const err = l.error
              ? `\n     \`${escapeMd(l.error.slice(0, 50))}\``
              : '';
            return `${icon} \`${l.chat_id}\` — ${new Date(l.sent_at).toLocaleString()}${err}`;
          })
          .join('\n\n')
      : '📭 Sin envíos registrados aún.';

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Volver', callback_data: `po:view:${id}` }],
        ],
      },
    });
    await ctx.answerCbQuery();
  });

  // --- Volver a la lista ---
  bot.action('po:back', async (ctx) => {
    await ctx.answerCbQuery();
    await showPostsList(ctx, true);
  });

  // --- Noop (para separadores o botones deshabilitados) ---
  bot.action('po:noop', async (ctx) => {
    await ctx.answerCbQuery();
  });

  // ============================================================
  // CAPTURA DE TEXTO (flujo /newpost + edición)
  // ============================================================
  bot.use(async (ctx, next) => {
    if (!ctx.message?.text) return next();

    // --- Edición de contenido de un post existente ---
    if (ctx.session?.editingPostId) {
      const id = ctx.session.editingPostId;
      ctx.session.editingPostId = null;
      const content = ctx.message.text.trim();

      scheduleModel.updateContent(id, content);
      return ctx.reply(`✅ Contenido de la publicación #${id} actualizado.`);
    }

    // --- Flujo /newpost ---
    const step = ctx.session?.step;
    if (!step || !ctx.session?.post) return next();

    const text = ctx.message.text.trim();
    const post = ctx.session.post;

    try {
      // PASO 1: contenido
      if (step === STEPS.CONTENT) {
        post.content = text;
        ctx.session.step = STEPS.TARGETS;

        const channels = channelModel.getByUser(ctx.state.user.id);
        const lines = channels.map(
          (c, i) =>
            `${i + 1}. ${escapeMd(c.title || c.chat_id)} (\`${c.chat_id}\`)`
        );
        return ctx.reply(
          'Paso 2/5: Elige los *destinos* (puedes enviar varios números separados por comas).\n\n' +
            lines.join('\n'),
          { parse_mode: 'Markdown' }
        );
      }

      // PASO 2: destinos
      if (step === STEPS.TARGETS) {
        const channels = channelModel.getByUser(ctx.state.user.id);
        const indexes = text
          .split(/[,\s]+/)
          .map((n) => parseInt(n, 10))
          .filter((n) => !isNaN(n));

        const selected = indexes
          .map((i) => channels[i - 1]?.chat_id)
          .filter(Boolean);

        if (!selected.length) {
          return ctx.reply('❌ Índices no válidos. Intenta de nuevo.');
        }

        post.targets = selected;
        ctx.session.step = STEPS.TYPE;

        return ctx.reply(
          'Paso 3/5: Elige el *tipo de programación*:\n\n' +
            '1️⃣ Una vez (fecha específica)\n' +
            '2️⃣ Diaria\n' +
            '3️⃣ Semanal\n' +
            '4️⃣ Mensual',
          { parse_mode: 'Markdown' }
        );
      }

      // PASO 3: tipo
      if (step === STEPS.TYPE) {
        const map = {
          1: SCHEDULE_TYPES.ONCE,
          2: SCHEDULE_TYPES.DAILY,
          3: SCHEDULE_TYPES.WEEKLY,
          4: SCHEDULE_TYPES.MONTHLY,
        };
        const type = map[text];
        if (!type) return ctx.reply('❌ Opción no válida. Envía 1, 2, 3 o 4.');

        post.schedule_type = type;

        // ONE-TIME: pide fecha completa
        if (type === SCHEDULE_TYPES.ONCE) {
          ctx.session.step = STEPS.RUN_DATE;
          return ctx.reply(
            'Paso 4/5: Envíame la *fecha y hora* en formato `DD/MM/AAAA HH:MM`.\n\n' +
              'Ejemplo: `25/12/2026 09:30`',
            { parse_mode: 'Markdown' }
          );
        }

        // WEEKLY: pide día de la semana
        if (type === SCHEDULE_TYPES.WEEKLY) {
          ctx.session.step = STEPS.WEEKDAY;
          return ctx.reply(
            'Paso 4/5: Envíame el *día de la semana*:\n\n' +
              '0️⃣ Domingo\n1️⃣ Lunes\n2️⃣ Martes\n3️⃣ Miércoles\n' +
              '4️⃣ Jueves\n5️⃣ Viernes\n6️⃣ Sábado',
            { parse_mode: 'Markdown' }
          );
        }

        // MONTHLY: pide día del mes
        if (type === SCHEDULE_TYPES.MONTHLY) {
          ctx.session.step = STEPS.DAY_OF_MONTH;
          return ctx.reply(
            'Paso 4/5: Envíame el *día del mes* (1-31).',
            { parse_mode: 'Markdown' }
          );
        }

        // DAILY: salta a la hora
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          'Paso 4/5: Envíame la *hora* en formato `HH:MM` (24h).\nEjemplo: `09:30`',
          { parse_mode: 'Markdown' }
        );
      }

      // PASO 4a: fecha única
      if (step === STEPS.RUN_DATE) {
        const m = text.match(
          /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/
        );
        if (!m)
          return ctx.reply('❌ Formato inválido. Usa `DD/MM/AAAA HH:MM`.');
        const [, dd, mm, yyyy, hh, min] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +min);
        if (isNaN(d)) return ctx.reply('❌ Fecha inválida.');
        if (d <= new Date()) return ctx.reply('❌ La fecha debe ser futura.');

        post.run_date = d.toISOString();
        post.hour = d.getHours();
        post.minute = d.getMinutes();
        return askConfirm(ctx, post);
      }

      // PASO 4b: día de la semana
      if (step === STEPS.WEEKDAY) {
        const wd = parseInt(text, 10);
        if (isNaN(wd) || wd < 0 || wd > 6) {
          return ctx.reply('❌ Día inválido. Envía un número del 0 al 6.');
        }
        post.weekday = wd;
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          `Día: *${WEEKDAYS[wd]}*.\n\nAhora la *hora* en formato \`HH:MM\`.`,
          { parse_mode: 'Markdown' }
        );
      }

      // PASO 4c: día del mes
      if (step === STEPS.DAY_OF_MONTH) {
        const dom = parseInt(text, 10);
        if (isNaN(dom) || dom < 1 || dom > 31) {
          return ctx.reply('❌ Día inválido. Envía un número del 1 al 31.');
        }
        post.day_of_month = dom;
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          `Día del mes: *${dom}*.\n\nAhora la *hora* en formato \`HH:MM\`.`,
          { parse_mode: 'Markdown' }
        );
      }

      // PASO 5: hora (para daily/weekly/monthly)
      if (step === STEPS.TIME) {
        const m = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return ctx.reply('❌ Formato inválido. Usa `HH:MM`.');
        const [, hh, mm] = m;
        const h = parseInt(hh, 10);
        const min = parseInt(mm, 10);
        if (h > 23 || min > 59) return ctx.reply('❌ Hora inválida.');

        post.hour = h;
        post.minute = min;
        return askConfirm(ctx, post);
      }

      // CONFIRMACIÓN
      if (step === STEPS.CONFIRM) {
        const ans = text.toLowerCase();
        if (['sí', 'si', 's', 'yes', 'y'].includes(ans)) {
          const result = scheduleService.create(ctx.state.user, post);
          ctx.session.post = null;
          ctx.session.step = null;

          return ctx.reply(
            `✅ *Publicación programada*\n\n` +
              `🆔 ID: \`${result.id}\`\n` +
              `📅 Próxima ejecución: *${formatDate(result.next_run)}*\n\n` +
              `Ver todas: /posts`,
            { parse_mode: 'Markdown' }
          );
        }

        ctx.session.post = null;
        ctx.session.step = null;
        return ctx.reply('❌ Cancelado.');
      }
    } catch (err) {
      ctx.session.post = null;
      ctx.session.step = null;
      return ctx.reply(`❌ ${err.message}`);
    }
  });
};

// ============================================================
// HELPERS
// ============================================================

/**
 * Construye el teclado inline para una publicación.
 */
function buildPostKeyboard(s, id) {
  return {
    inline_keyboard: [
      [
        s.is_active
          ? { text: '⏸ Pausar', callback_data: `po:pause:${id}` }
          : { text: '▶️ Reanudar', callback_data: `po:resume:${id}` },
        { text: '📜 Ver log', callback_data: `po:log:${id}` },
      ],
      [
        { text: '✏️ Editar contenido', callback_data: `po:edit:${id}` },
        { text: '🗑 Borrar', callback_data: `po:del:${id}` },
      ],
      [{ text: '⬅️ Volver', callback_data: 'po:back' }],
    ],
  };
}

/**
 * Refresca la vista de detalle de una publicación tras una acción.
 */
async function refreshPostView(ctx, s) {
  const targets = scheduleModel.getTargets(s.id);
  const status = s.is_active ? '🟢 Activa' : '⏸ Pausada';
  const typeLabel = {
    once: 'Una vez',
    daily: 'Diaria',
    weekly: 'Semanal',
    monthly: 'Mensual',
  }[s.schedule_type];

  const text =
    `📝 *Publicación #${s.id}*\n\n` +
    `Estado: ${status}\n` +
    `Tipo: ${typeLabel}\n` +
    `Destinos: ${targets.length}\n` +
    `Próxima: ${s.next_run ? formatDate(s.next_run) : '—'}\n\n` +
    `Contenido:\n_${escapeMd(s.content)}_`;

  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: buildPostKeyboard(s, s.id),
    });
  } catch (err) {
    // Si el mensaje no cambió, Telegram lanza error — lo ignoramos
    if (!err.message.includes('message is not modified')) {
      console.error('Error refrescando vista de post:', err.message);
    }
  }
}

/**
 * Muestra la lista de publicaciones del usuario.
 */
async function showPostsList(ctx, edit = false) {
  const list = scheduleModel.getByUser(ctx.state.user.id);

  const text = list.length
    ? `📋 *Tus publicaciones:*\n\nSelecciona una para gestionarla.`
    : '📭 No tienes publicaciones.\nUsa /newpost para crear una.';

  const keyboard = list.map((s) => {
    const icon = s.is_active ? '🟢' : '⏸';
    const preview = s.content.length > 35
      ? s.content.slice(0, 35) + '…'
      : s.content;
    return [
      {
        text: `${icon} #${s.id} — ${s.schedule_type} — ${preview}`,
        callback_data: `po:view:${s.id}`,
      },
    ];
  });

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  };

  if (edit && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, opts);
    } catch (err) {
      if (!err.message.includes('message is not modified')) throw err;
    }
  } else {
    await ctx.reply(text, opts);
  }
}

/**
 * Pide confirmación al usuario antes de crear la publicación.
 */
function askConfirm(ctx, post) {
  ctx.session.step = STEPS.CONFIRM;

  const typeLabel = {
    once: 'Una vez',
    daily: 'Diaria',
    weekly: 'Semanal',
    monthly: 'Mensual',
  }[post.schedule_type];

  let when = '';
  if (post.schedule_type === 'once') {
    when = formatDate(post.run_date);
  } else if (post.schedule_type === 'weekly') {
    when = `Cada ${WEEKDAYS[post.weekday]} a las ${pad(post.hour)}:${pad(post.minute)}`;
  } else if (post.schedule_type === 'monthly') {
    when = `Día ${post.day_of_month} de cada mes a las ${pad(post.hour)}:${pad(post.minute)}`;
  } else {
    when = `Todos los días a las ${pad(post.hour)}:${pad(post.minute)}`;
  }

  return ctx.reply(
    `📋 *Resumen*\n\n` +
      `📝 Contenido: ${escapeMd(truncate(post.content, 60))}\n` +
      `🎯 Destinos: ${post.targets.length}\n` +
      `🔁 Tipo: ${typeLabel}\n` +
      `⏰ Cuándo: ${when}\n\n` +
      `¿Confirmas? Responde *sí* o *no*.`,
    { parse_mode: 'Markdown' }
  );
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function escapeMd(str = '') {
  return String(str).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}