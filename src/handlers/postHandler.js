// src/handlers/postHandler.js
const scheduleService = require('../services/scheduleService');
const scheduleModel = require('../models/scheduleModel');
const logModel = require('../models/logModel');
const channelModel = require('../models/channelModel');
const planService = require('../services/planService');
const { parseButtonsJson, buildUrlKeyboard } = require('../utils/buttonBuilder');
const { SCHEDULE_TYPES } = require('../config/constants');
const { formatDate, WEEKDAYS } = require('../utils/dateHelpers');

const STEPS = {
  CONTENT: 'content',
  MEDIA: 'media',
  FORMAT: 'format',
  BUTTONS: 'buttons',
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
  // COMANDO /newpost
  // ============================================================
  bot.command('newpost', async (ctx) => {
    const channels = channelModel.getByUser(ctx.state.user.id);
    if (!channels.length) {
      return ctx.reply('⚠️ No tienes canales registrados.\nUsa /addchannel primero.');
    }

    ctx.session.post = {};
    ctx.session.step = STEPS.CONTENT;

    return ctx.reply(
      '📝 *Nueva publicación*\n\n' +
        'Paso 1/6: Envíame el *contenido* del mensaje.\n\n' +
        '💡 *Formatos soportados:*\n' +
        '• `*negrita*`\n' +
        '• `_cursiva_`\n' +
        '• `~tachado~`\n' +
        '• `||spoiler||`\n' +
        '• `>cita` (al inicio de línea)\n' +
        '• `` `código` ``\n\n' +
        'Escribe /cancel para cancelar.',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // COMANDO /posts
  // ============================================================
  bot.command('posts', async (ctx) => {
    await showPostsList(ctx);
  });

  // ============================================================
  // COMANDO /cancel
  // ============================================================
  bot.command('cancel', async (ctx) => {
    ctx.session.post = null;
    ctx.session.step = null;
    ctx.session.editingPostId = null;
    return ctx.reply('❌ Operación cancelada.');
  });

  // ============================================================
  // COMANDO /log <ID>
  // ============================================================
  bot.command('log', async (ctx) => {
    const id = parseInt(ctx.message.text.split(' ')[1], 10);
    if (isNaN(id)) return ctx.reply('Uso: /log <ID>');

    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.reply('❌ No encontré esa publicación.');
    }

    const logs = logModel.getBySchedule(id, 15);
    if (!logs.length) {
      return ctx.reply(`📭 La publicación #${id} no tiene envíos aún.`);
    }

    const text =
      `📜 *Últimos envíos de #${id}*\n\n` +
      logs
        .map((l) => {
          const icon =
            l.status === 'success' ? '✅' : l.status === 'fatal' ? '💀' : '❌';
          const err = l.error
            ? `\n     \`${escapeMd(l.error.slice(0, 60))}\``
            : '';
          return `${icon} \`${l.chat_id}\` — ${new Date(l.sent_at).toLocaleString()}${err}`;
        })
        .join('\n\n');

    return ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // ============================================================
  // CALLBACKS DE BOTONES
  // ============================================================

  bot.action(/^po:view:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const s = scheduleModel.findById(id);
    if (!s || s.user_id !== ctx.state.user.id) {
      return ctx.answerCbQuery('❌ No encontrada');
    }

    await ctx.editMessageText(buildPostText(s), {
      parse_mode: 'Markdown',
      reply_markup: buildPostKeyboard(s, id),
    });
    await ctx.answerCbQuery();
  });

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
            const icon =
              l.status === 'success' ? '✅' : l.status === 'fatal' ? '💀' : '❌';
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

  bot.action('po:back', async (ctx) => {
    await ctx.answerCbQuery();
    await showPostsList(ctx, true);
  });

  // ============================================================
  // CAPTURA DE FOTO
  // ============================================================
  bot.on('photo', async (ctx, next) => {
    if (ctx.session?.step !== STEPS.MEDIA) return next();

    // La foto de mayor resolución es la última del array
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    ctx.session.post.media_type = 'photo';
    ctx.session.post.media_file_id = fileId;
    ctx.session.step = STEPS.FORMAT;

    return ctx.reply(
      '🖼 Imagen añadida.\n\n' +
        'Paso 3/6: Elige el *formato del texto*:\n\n' +
        '1️⃣ MarkdownV2 (recomendado)\n' +
        '2️⃣ HTML\n' +
        '3️⃣ Sin formato (texto plano)',
      { parse_mode: 'Markdown' }
    );
  });

  // ============================================================
  // CAPTURA DE TEXTO (flujo /newpost + edición)
  // ============================================================
  bot.use(async (ctx, next) => {
    if (!ctx.message?.text) return next();

    // --- Edición de contenido ---
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
      // ============ PASO 1: contenido ============
      if (step === STEPS.CONTENT) {
        post.content = text;
        ctx.session.step = STEPS.MEDIA;
        return ctx.reply(
          'Paso 2/6: ¿Quieres añadir una *imagen*?\n\n' +
            '📸 Envía una foto, o escribe `saltar` para continuar sin imagen.',
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 2: imagen (solo saltar) ============
      if (step === STEPS.MEDIA) {
        if (['saltar', '0', 'no'].includes(text.toLowerCase())) {
          post.media_type = null;
          post.media_file_id = null;
          ctx.session.step = STEPS.FORMAT;
          return ctx.reply(
            'Paso 3/6: Elige el *formato del texto*:\n\n' +
              '1️⃣ MarkdownV2\n' +
              '2️⃣ HTML\n' +
              '3️⃣ Sin formato',
            { parse_mode: 'Markdown' }
          );
        }
        return ctx.reply(
          '📸 Envía una imagen o escribe `saltar` para continuar sin imagen.',
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 3: formato ============
      if (step === STEPS.FORMAT) {
        const map = {
          1: 'MarkdownV2',
          2: 'HTML',
          3: null,
        };
        const mode = map[text];
        if (mode === undefined) {
          return ctx.reply('❌ Opción no válida. Envía 1, 2 o 3.');
        }
        post.parse_mode = mode;
        ctx.session.step = STEPS.BUTTONS;

        // Si es free, saltar paso de botones
        const plan = planService.getEffectivePlan(ctx.state.user);
        if (plan.name === 'free') {
          post.buttons_json = null;
          ctx.session.step = STEPS.TARGETS;
          const channels = channelModel.getByUser(ctx.state.user.id);
          const lines = channels.map(
            (c, i) =>
              `${i + 1}. ${escapeMd(c.title || c.chat_id)} (\`${c.chat_id}\`)`
          );
          return ctx.reply(
            '🔘 Los botones con enlace son una función de pago.\n\n' +
              'Paso 5/6: Elige los *destinos* (varios números separados por comas).\n\n' +
              lines.join('\n'),
            { parse_mode: 'Markdown' }
          );
        }

        return ctx.reply(
          'Paso 4/6: *Botones con enlace* (opcional)\n\n' +
            'Envía los botones en este formato:\n' +
            '`Texto del botón | https://url.com`\n\n' +
            '📌 Varios botones en la misma fila: sepáralos con `;;`\n' +
            '📌 Botones en filas distintas: uno por línea\n\n' +
            'Ejemplo:\n' +
            '`📢 Canal | https://t.me/mi_canal ;; 💬 Grupo | https://t.me/mi_grupo`\n' +
            '`🌐 Web | https://miweb.com`\n\n' +
            'Escribe `saltar` para continuar sin botones.',
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 4: botones ============
      if (step === STEPS.BUTTONS) {
        if (['saltar', 'no', '0'].includes(text.toLowerCase())) {
          post.buttons_json = null;
        } else {
          try {
            const rows = parseButtonInput(text);
            if (!rows.length) {
              return ctx.reply(
                '❌ No detecté botones válidos. Intenta de nuevo o escribe `saltar`.'
              );
            }
            post.buttons_json = JSON.stringify(rows);
          } catch (err) {
            return ctx.reply(`❌ ${err.message}`);
          }
        }

        ctx.session.step = STEPS.TARGETS;
        const channels = channelModel.getByUser(ctx.state.user.id);
        const lines = channels.map(
          (c, i) =>
            `${i + 1}. ${escapeMd(c.title || c.chat_id)} (\`${c.chat_id}\`)`
        );
        return ctx.reply(
          'Paso 5/6: Elige los *destinos* (varios números separados por comas).\n\n' +
            lines.join('\n'),
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 5: destinos ============
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
          'Paso 6/6: Elige el *tipo de programación*:\n\n' +
            '1️⃣ Una vez (fecha específica)\n' +
            '2️⃣ Diaria\n' +
            '3️⃣ Semanal\n' +
            '4️⃣ Mensual',
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 6: tipo ============
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

        if (type === SCHEDULE_TYPES.ONCE) {
          ctx.session.step = STEPS.RUN_DATE;
          return ctx.reply(
            '📅 Envíame la *fecha y hora* en formato `DD/MM/AAAA HH:MM`.\n\n' +
              'Ejemplo: `25/12/2026 09:30`',
            { parse_mode: 'Markdown' }
          );
        }

        if (type === SCHEDULE_TYPES.WEEKLY) {
          ctx.session.step = STEPS.WEEKDAY;
          return ctx.reply(
            '📅 Envíame el *día de la semana*:\n\n' +
              '0️⃣ Domingo\n1️⃣ Lunes\n2️⃣ Martes\n3️⃣ Miércoles\n' +
              '4️⃣ Jueves\n5️⃣ Viernes\n6️⃣ Sábado',
            { parse_mode: 'Markdown' }
          );
        }

        if (type === SCHEDULE_TYPES.MONTHLY) {
          ctx.session.step = STEPS.DAY_OF_MONTH;
          return ctx.reply('📅 Envíame el *día del mes* (1-31).', {
            parse_mode: 'Markdown',
          });
        }

        // DAILY: salta directo a hora
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          '🕒 Envíame la *hora* en formato `HH:MM` (24h).\nEjemplo: `09:30`',
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 6a: fecha única ============
      if (step === STEPS.RUN_DATE) {
        const m = text.match(
          /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/
        );
        if (!m) {
          return ctx.reply('❌ Formato inválido. Usa `DD/MM/AAAA HH:MM`.');
        }
        const [, dd, mm, yyyy, hh, min] = m;
        const d = new Date(+yyyy, +mm - 1, +dd, +hh, +min);
        if (isNaN(d)) return ctx.reply('❌ Fecha inválida.');
        if (d <= new Date()) return ctx.reply('❌ La fecha debe ser futura.');

        post.run_date = d.toISOString();
        post.hour = d.getHours();
        post.minute = d.getMinutes();
        return await askConfirm(ctx, post);
      }

      // ============ PASO 6b: día de la semana ============
      if (step === STEPS.WEEKDAY) {
        const wd = parseInt(text, 10);
        if (isNaN(wd) || wd < 0 || wd > 6) {
          return ctx.reply('❌ Día inválido. Envía un número del 0 al 6.');
        }
        post.weekday = wd;
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          `Día: *${WEEKDAYS[wd]}*.\n\n🕒 Ahora la *hora* en formato \`HH:MM\`.`,
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 6c: día del mes ============
      if (step === STEPS.DAY_OF_MONTH) {
        const dom = parseInt(text, 10);
        if (isNaN(dom) || dom < 1 || dom > 31) {
          return ctx.reply('❌ Día inválido. Envía un número del 1 al 31.');
        }
        post.day_of_month = dom;
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          `Día del mes: *${dom}*.\n\n🕒 Ahora la *hora* en formato \`HH:MM\`.`,
          { parse_mode: 'Markdown' }
        );
      }

      // ============ PASO 6d: hora ============
      if (step === STEPS.TIME) {
        const m = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return ctx.reply('❌ Formato inválido. Usa `HH:MM`.');
        const [, hh, mm] = m;
        const h = parseInt(hh, 10);
        const min = parseInt(mm, 10);
        if (h > 23 || min > 59) return ctx.reply('❌ Hora inválida.');

        post.hour = h;
        post.minute = min;
        return await askConfirm(ctx, post);
      }

      // ============ CONFIRMACIÓN ============
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
 * Construye el texto descriptivo de una publicación.
 */
function buildPostText(s) {
  const targets = scheduleModel.getTargets(s.id);
  const status = s.is_active ? '🟢 Activa' : '⏸ Pausada';
  const typeLabel = {
    once: 'Una vez',
    daily: 'Diaria',
    weekly: 'Semanal',
    monthly: 'Mensual',
  }[s.schedule_type];

  let extras = '';
  if (s.media_type === 'photo') extras += '🖼 Con imagen\n';
  if (s.buttons_json) extras += '🔘 Con botones\n';
  if (s.parse_mode) extras += `🎨 Formato: ${s.parse_mode}\n`;

  return (
    `📝 *Publicación #${s.id}*\n\n` +
    `Estado: ${status}\n` +
    `Tipo: ${typeLabel}\n` +
    `Destinos: ${targets.length}\n` +
    `Próxima: ${s.next_run ? formatDate(s.next_run) : '—'}\n` +
    (extras ? `\n${extras}` : '') +
    `\nContenido:\n_${escapeMd(s.content)}_`
  );
}

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
 * Refresca la vista de detalle tras una acción.
 */
async function refreshPostView(ctx, s) {
  try {
    await ctx.editMessageText(buildPostText(s), {
      parse_mode: 'Markdown',
      reply_markup: buildPostKeyboard(s, s.id),
    });
  } catch (err) {
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
    const preview =
      s.content.length > 35 ? s.content.slice(0, 35) + '…' : s.content;
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
async function askConfirm(ctx, post) {
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

  // --- VISTA PREVIA ---
  await ctx.reply('👁 *Vista previa de tu publicación:*', {
    parse_mode: 'Markdown',
  });

  const preview = await sendPreview(ctx, post);

  if (!preview.ok) {
      // El formato falló → mostrar error al usuario y pedir corrección
      await ctx.reply(
        `⚠️ *La vista previa falló*\n\n` +
          `Error: \`${escapeMd(preview.error)}\`\n\n` +
          `Esto significa que tu publicación NO se enviará a los canales con este formato.\n\n` +
          `Opciones:\n` +
          `• Escribe /cancel y crea una nueva publicación\n` +
          `• Responde *sí* para guardarla de todas formas (fallará al publicar)\n` +
          `• Responde *no* para cancelar`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Vista previa OK → pedir confirmación
    await ctx.reply(
      `✅ *Vista previa correcta*\n\n` +
        `📋 *Resumen*\n` +
        `🎯 Destinos: ${post.targets.length}\n` +
        `🔁 Tipo: ${typeLabel}\n` +
        `⏰ Cuándo: ${when}\n\n` +
        `¿Confirmas la programación? Responde *sí* o *no*.`,
      { parse_mode: 'Markdown' }
    );
  }

/**
 * Envía una vista previa de la publicación al chat del usuario.
 * Devuelve true si se envió correctamente, false si hubo error de formato.
 */
async function sendPreview(ctx, post) {
  const replyMarkup = post.buttons_json
    ? parseButtonsJson(post.buttons_json)
    : null;

  const parseMode = post.parse_mode || null;

  const options = {
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  try {
    if (post.media_type === 'photo' && post.media_file_id) {
      await ctx.replyWithPhoto(post.media_file_id, {
        caption: post.content,
        ...options,
      });
    } else {
      await ctx.reply(post.content, options);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Convierte el JSON de botones en un reply_markup.
 */
function parseButtonsJson(json) {
  try {
    const rows = JSON.parse(json);
    return {
      inline_keyboard: rows.map((row) =>
        row.map((btn) => ({
          text: btn.text,
          url: btn.url,
          ...(btn.style ? { style: btn.style } : {}),
        }))
      ),
    };
  } catch (err) {
    console.error('Error parseando botones:', err.message);
    return null;
  }
}

/**
 * Parsea la entrada de botones del usuario.
 * Formato: "Texto | url" con ";;" para separar en misma fila,
 * y salto de línea para nueva fila.
 */
function parseButtonInput(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];

  for (const line of lines) {
    const buttons = line.split(';;').map((b) => b.trim());
    const row = [];

    for (const btn of buttons) {
      const parts = btn.split('|').map((p) => p.trim());
      if (parts.length !== 2) {
        throw new Error(
          `Formato incorrecto: "${btn}". Usa "Texto | https://url.com"`
        );
      }
      const [label, url] = parts;
      if (!/^https?:\/\//.test(url)) {
        throw new Error(`La URL debe empezar por http o https: "${url}"`);
      }
      row.push({ text: label, url, style: null });
    }

    if (row.length) rows.push(row);
  }

  return rows;
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