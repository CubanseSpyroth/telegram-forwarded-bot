// src/handlers/postHandler.js
const scheduleService = require('../services/scheduleService');
const scheduleModel = require('../models/scheduleModel');
const logModel = require('../models/logModel');
const channelModel = require('../models/channelModel');
const planService = require('../services/planService');
const { formatDate, WEEKDAYS, calculateNextRun } = require('../utils/dateHelpers');
const { parseButtonsJson } = require('../utils/buttons');

const {
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_LABELS,
  POST_STEPS: STEPS,
  POST_EDIT_FIELDS: EDIT_FIELDS,
  CONFIRM_YES_WORDS,
  CONFIRM_SKIP_WORDS,
  LOG_STATUS_ICONS,
} = require('../config/constants');

// ============================================================
// EXPORT PRINCIPAL
// ============================================================

module.exports = (bot) => {
  registerCommands(bot);
  registerViewActions(bot);
  registerEditActions(bot);
  registerFlowCallbacks(bot);
  registerFlowHandlers(bot);
};

// ============================================================
// COMANDOS
// ============================================================

function registerCommands(bot) {
  bot.command('newpost', cmdNewPost);
  bot.command('posts', (ctx) => showPostsList(ctx));
  bot.command('cancel', cmdCancel);
  bot.command('log', cmdLog);
}

async function cmdNewPost(ctx) {
  const channels = channelModel.getByUser(ctx.state.user.id);
  if (!channels.length) {
    return ctx.reply('⚠️ No tienes canales registrados.\nUsa /addchannel primero.');
  }

  ctx.session.post = {};
  ctx.session.step = STEPS.CONTENT;

  return ctx.reply(
    '📝 *Nueva publicación*\n\n' +
      'Paso 1/6: Envíame el *contenido* del mensaje.\n\n' +
      '💡 Formatos soportados:\n' +
      '• `*negrita*`\n' +
      '• `_cursiva_`\n' +
      '• `~tachado~`\n' +
      '• `||spoiler||`\n' +
      '• `>cita`\n' +
      '• `` `código` ``\n\n' +
      'Escribe /cancel para cancelar.',
    { parse_mode: 'Markdown' }
  );
}

async function cmdCancel(ctx) {
  ctx.session.post = null;
  ctx.session.step = null;
  ctx.session.editing = null;
  return ctx.reply('❌ Operación cancelada.');
}

async function cmdLog(ctx) {
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('Uso: /log <ID>');

  const s = scheduleModel.findById(id);
  if (!s || s.user_id !== ctx.state.user.id) {
    return ctx.reply('❌ No encontré esa publicación.');
  }

  const logs = logModel.getBySchedule(id, 15);
  if (!logs.length) return ctx.reply(`📭 La publicación #${id} no tiene envíos aún.`);

  return ctx.reply(formatLogsText(id, logs), { parse_mode: 'Markdown' });
}

// ============================================================
// ACCIONES DE GESTIÓN (po:*)
// ============================================================

function registerViewActions(bot) {
  bot.action(/^po:view:(\d+)$/, onView);
  bot.action(/^po:pause:(\d+)$/, (ctx) => onToggleActive(ctx, false));
  bot.action(/^po:resume:(\d+)$/, (ctx) => onToggleActive(ctx, true));
  bot.action(/^po:del:(\d+)$/, onDeleteConfirm);
  bot.action(/^po:delok:(\d+)$/, onDeleteConfirmYes);
  bot.action(/^po:log:(\d+)$/, onViewLog);
  bot.action('po:back', onBack);
}

async function onView(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  await safeEdit(ctx, buildPostHeader(s), {
    parse_mode: 'Markdown',
    reply_markup: buildPostKeyboard(s),
  });

  await ctx.reply('👁 *Vista previa:*', { parse_mode: 'Markdown' });
  const preview = await sendPostPreview(ctx, s);

  if (!preview.ok) {
    await ctx.reply(
      `⚠️ La vista previa falló:\n\`${escapeMd(preview.error.slice(0, 100))}\``,
      { parse_mode: 'Markdown' }
    );
  }
}

async function onToggleActive(ctx, isActive) {
  const s = await findUserPost(ctx);
  if (!s) return;

  scheduleModel.toggleActive(s.id, isActive);
  const updated = scheduleModel.findById(s.id);

  await ctx.answerCbQuery(isActive ? '▶️ Reactivada' : '⏸ Pausada');
  await refreshHeader(ctx, updated);
}

async function onDeleteConfirm(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `⚠️ ¿Borrar la publicación *#${s.id}*?\n\n` +
      `_${escapeMd(truncate(s.content, 80))}_\n\n` +
      `Esta acción no se puede deshacer.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Sí, borrar', callback_data: `po:delok:${s.id}` },
            { text: '❌ Cancelar', callback_data: `po:view:${s.id}` },
          ],
        ],
      },
    }
  );
}

async function onDeleteConfirmYes(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  scheduleModel.delete(s.id);
  await ctx.answerCbQuery('🗑 Eliminada');
  await showPostsList(ctx, true);
}

async function onViewLog(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  const logs = logModel.getBySchedule(s.id, 10);
  const text = logs.length
    ? formatLogsText(s.id, logs)
    : '📭 Sin envíos registrados aún.';

  await ctx.answerCbQuery();
  await safeEdit(ctx, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Volver', callback_data: `po:view:${s.id}` }]],
    },
  });
}

async function onBack(ctx) {
  await ctx.answerCbQuery();
  await showPostsList(ctx, true);
}

// ============================================================
// ACCIONES DE EDICIÓN (poe:*)
// ============================================================

function registerEditActions(bot) {
  bot.action(/^po:edit:(\d+)$/, onEditMenu);

  // Contenido
  bot.action(/^poe:content:(\d+)$/, (ctx) => startEditing(ctx, EDIT_FIELDS.CONTENT));

  // Imagen
  bot.action(/^poe:media:(\d+)$/, onEditMediaMenu);
  bot.action(/^poe:media:new:(\d+)$/, (ctx) => startEditing(ctx, EDIT_FIELDS.MEDIA));
  bot.action(/^poe:media:remove:(\d+)$/, (ctx) => onEditRemove(ctx, EDIT_FIELDS.MEDIA));

  // Botones
  bot.action(/^poe:buttons:(\d+)$/, onEditButtonsMenu);
  bot.action(/^poe:buttons:new:(\d+)$/, (ctx) => startEditing(ctx, EDIT_FIELDS.BUTTONS));
  bot.action(/^poe:buttons:remove:(\d+)$/, (ctx) => onEditRemove(ctx, EDIT_FIELDS.BUTTONS));

  // Formato
  bot.action(/^poe:format:(\d+)$/, onEditFormatMenu);
  bot.action(/^poe:format:set:(\d+):(.+)$/, onEditFormatSet);

  // Destinos
  bot.action(/^poe:targets:(\d+)$/, (ctx) => startEditing(ctx, EDIT_FIELDS.TARGETS));

  // Tipo
  bot.action(/^poe:type:(\d+)$/, onEditTypeMenu);
  bot.action(/^poe:type:set:(\d+):(.+)$/, onEditTypeSet);

  // Hora
  bot.action(/^poe:time:(\d+)$/, (ctx) => startEditing(ctx, EDIT_FIELDS.TIME));

  // Fecha/día
  bot.action(/^poe:date:(\d+)$/, onEditDateMenu);
}

async function onEditMenu(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  await safeEdit(ctx, `✏️ *Editar publicación #${s.id}*\n\n¿Qué quieres modificar?`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buildEditKeyboard(s.id) },
  });
}

function buildEditKeyboard(id) {
  return [
    [
      { text: '📝 Contenido', callback_data: `poe:content:${id}` },
      { text: '🖼 Imagen', callback_data: `poe:media:${id}` },
    ],
    [
      { text: '🔘 Botones', callback_data: `poe:buttons:${id}` },
      { text: '🎨 Formato', callback_data: `poe:format:${id}` },
    ],
    [
      { text: '🎯 Destinos', callback_data: `poe:targets:${id}` },
      { text: '🔁 Tipo', callback_data: `poe:type:${id}` },
    ],
    [
      { text: '🕒 Hora', callback_data: `poe:time:${id}` },
      { text: '📅 Fecha/Día', callback_data: `poe:date:${id}` },
    ],
    [{ text: '⬅️ Volver', callback_data: `po:view:${id}` }],
  ];
}

async function onEditMediaMenu(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  const current = s.media_type === 'photo' ? '🖼 Con imagen' : '📭 Sin imagen';

  await safeEdit(ctx, `🖼 *Imagen actual:* ${current}\n\n¿Qué quieres hacer?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📸 Enviar nueva', callback_data: `poe:media:new:${s.id}` }],
        ...(s.media_type === 'photo'
          ? [[{ text: '🗑 Quitar imagen', callback_data: `poe:media:remove:${s.id}` }]]
          : []),
        [{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }],
      ],
    },
  });
}

async function onEditButtonsMenu(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  const plan = planService.getEffectivePlan(ctx.state.user);
  if (plan.name === 'free') {
    return safeEdit(
      ctx,
      '🔘 Los botones con enlace son una función de pago.\n\nActualiza tu plan para usarlos.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💼 Ver planes', callback_data: 'plans:show' },
              { text: '⬅️ Volver', callback_data: `po:edit:${s.id}` },
            ],
          ],
        },
      }
    );
  }

  const current = s.buttons_json ? '🔘 Con botones' : '📭 Sin botones';

  await safeEdit(ctx, `🔘 *Botones actuales:* ${current}\n\n¿Qué quieres hacer?`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✏️ Reescribir', callback_data: `poe:buttons:new:${s.id}` }],
        ...(s.buttons_json
          ? [[{ text: '🗑 Quitar botones', callback_data: `poe:buttons:remove:${s.id}` }]]
          : []),
        [{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }],
      ],
    },
  });
}

async function onEditFormatMenu(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `🎨 *Formato actual:* ${s.parse_mode || 'Sin formato'}\n\nElige el nuevo formato:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '1️⃣ HTML', callback_data: `poe:format:set:${s.id}:HTML` }],
          [
            {
              text: '2️⃣ MarkdownV2',
              callback_data: `poe:format:set:${s.id}:MarkdownV2`,
            },
          ],
          [{ text: '3️⃣ Sin formato', callback_data: `poe:format:set:${s.id}:NONE` }],
          [{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }],
        ],
      },
    }
  );
}

async function onEditFormatSet(ctx) {
  const id = Number(ctx.match[1]);
  const format = ctx.match[2];

  const s = scheduleModel.findById(id);
  if (!s || s.user_id !== ctx.state.user.id) {
    return ctx.answerCbQuery('❌ No encontrada');
  }

  const mode = format === 'NONE' ? null : format;
  scheduleModel.updateParseMode(id, mode);

  await ctx.answerCbQuery('✅ Formato actualizado');
  await safeEdit(ctx, `✅ Formato actualizado a *${format}*.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Volver', callback_data: `po:edit:${id}` }]],
    },
  });
}

async function onEditTypeMenu(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();
  await safeEdit(
    ctx,
    `🔁 *Tipo actual:* ${SCHEDULE_TYPE_LABELS[s.schedule_type]}\n\nElige el nuevo tipo:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '1️⃣ Una vez', callback_data: `poe:type:set:${s.id}:once` }],
          [{ text: '2️⃣ Diaria', callback_data: `poe:type:set:${s.id}:daily` }],
          [{ text: '3️⃣ Semanal', callback_data: `poe:type:set:${s.id}:weekly` }],
          [{ text: '4️⃣ Mensual', callback_data: `poe:type:set:${s.id}:monthly` }],
          [{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }],
        ],
      },
    }
  );
}

async function onEditTypeSet(ctx) {
  const id = Number(ctx.match[1]);
  const type = ctx.match[2];

  const s = scheduleModel.findById(id);
  if (!s || s.user_id !== ctx.state.user.id) {
    return ctx.answerCbQuery('❌ No encontrada');
  }

  if (!Object.values(SCHEDULE_TYPES).includes(type)) {
    return ctx.answerCbQuery('❌ Tipo inválido');
  }

  scheduleModel.updateType(id, type);
  await recalcNextRun(id);

  await ctx.answerCbQuery('✅ Tipo actualizado');
  await safeEdit(ctx, `✅ Tipo actualizado a *${SCHEDULE_TYPE_LABELS[type]}*.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: '⬅️ Volver', callback_data: `po:edit:${id}` }]],
    },
  });
}

async function onEditDateMenu(ctx) {
  const s = await findUserPost(ctx);
  if (!s) return;

  await ctx.answerCbQuery();

  const goBack = [{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }];

  if (s.schedule_type === SCHEDULE_TYPES.ONCE) {
    ctx.session.editing = { postId: s.id, field: EDIT_FIELDS.RUN_DATE };
    return safeEdit(ctx, '📅 Envíame la nueva fecha y hora en formato `DD/MM/AAAA HH:MM`.', {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [goBack] },
    });
  }

  if (s.schedule_type === SCHEDULE_TYPES.WEEKLY) {
    ctx.session.editing = { postId: s.id, field: EDIT_FIELDS.WEEKDAY };
    return safeEdit(
      ctx,
      `📅 *Día actual:* ${WEEKDAYS[s.weekday]}\n\nEnvíame el nuevo día (0=Domingo ... 6=Sábado).`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [goBack] } }
    );
  }

  if (s.schedule_type === SCHEDULE_TYPES.MONTHLY) {
    ctx.session.editing = { postId: s.id, field: EDIT_FIELDS.DAY_OF_MONTH };
    return safeEdit(
      ctx,
      `📅 *Día actual:* ${s.day_of_month}\n\nEnvíame el nuevo día del mes (1-31).`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [goBack] } }
    );
  }

  return safeEdit(
    ctx,
    '❌ Una publicación diaria no tiene fecha específica. Usa *Hora*.',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [goBack] } }
  );
}

async function startEditing(ctx, field) {
  const s = await findUserPost(ctx);
  if (!s) return;

  if (field === EDIT_FIELDS.TIME && s.schedule_type === SCHEDULE_TYPES.ONCE) {
    return ctx.answerCbQuery('❌ Una publicación "una vez" no tiene hora recurrente');
  }

  ctx.session.editing = { postId: s.id, field };
  await ctx.answerCbQuery();

  const prompts = {
    [EDIT_FIELDS.CONTENT]: `📝 Envíame el nuevo *contenido* para la publicación *#${s.id}*.`,
    [EDIT_FIELDS.MEDIA]: '📸 Envíame la nueva imagen para la publicación.',
    [EDIT_FIELDS.BUTTONS]:
      '✏️ Envía los nuevos botones:\n\n' +
      '`Texto | https://url.com`\n\n' +
      '📌 Varios en misma fila: sepáralos con `;;`\n' +
      '📌 Filas distintas: uno por línea\n\n' +
      'Envía *saltar* para dejarla sin botones.',
    [EDIT_FIELDS.TARGETS]: '🎯 Envía los índices de los nuevos destinos separados por comas.',
    [EDIT_FIELDS.TIME]: `🕒 *Hora actual:* ${pad(s.hour)}:${pad(s.minute)}\n\nEnvíame la nueva hora en formato \`HH:MM\`.`,
    [EDIT_FIELDS.RUN_DATE]: '📅 Envíame la nueva fecha y hora en formato `DD/MM/AAAA HH:MM`.',
    [EDIT_FIELDS.WEEKDAY]: `📅 *Día actual:* ${WEEKDAYS[s.weekday]}\n\nEnvíame el nuevo día (0=Domingo ... 6=Sábado).`,
    [EDIT_FIELDS.DAY_OF_MONTH]: `📅 *Día actual:* ${s.day_of_month}\n\nEnvíame el nuevo día del mes (1-31).`,
  };

  const text = prompts[field] || '✏️ Envíame el nuevo valor.';
  return ctx.reply(text, { parse_mode: 'Markdown' });
}

async function onEditRemove(ctx, field) {
  const s = await findUserPost(ctx);
  if (!s) return;

  if (field === EDIT_FIELDS.MEDIA) {
    scheduleModel.updateMedia(s.id, null, null);
    await ctx.answerCbQuery('🗑 Imagen eliminada');
    return safeEdit(ctx, `✅ Imagen eliminada de la publicación #${s.id}.`, {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }]],
      },
    });
  }

  if (field === EDIT_FIELDS.BUTTONS) {
    scheduleModel.updateButtons(s.id, null);
    await ctx.answerCbQuery('🗑 Botones eliminados');
    return safeEdit(ctx, `✅ Botones eliminados de la publicación #${s.id}.`, {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Volver', callback_data: `po:edit:${s.id}` }]],
      },
    });
  }
}

// ============================================================
// CALLBACKS DEL FLUJO /newpost
// ============================================================

function registerFlowCallbacks(bot) {
  bot.action('np:media:skip', onNpMediaSkip);
  bot.action(/^np:format:(HTML|MarkdownV2|NONE)$/, onNpFormat);
  bot.action('np:buttons:skip', onNpButtonsSkip);
  bot.action(/^np:type:(once|daily|weekly|monthly)$/, onNpType);
  bot.action('np:confirm:yes', onNpConfirmYes);
  bot.action('np:confirm:no', onNpConfirmNo);
}

async function onNpMediaSkip(ctx) {
  if (ctx.session?.step !== STEPS.MEDIA) return ctx.answerCbQuery();

  ctx.session.post.media_type = null;
  ctx.session.post.media_file_id = null;
  ctx.session.step = STEPS.FORMAT;

  await ctx.answerCbQuery();
  return safeEdit(ctx, stepFormatText(), {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buildFormatKeyboard() },
  });
}

async function onNpFormat(ctx) {
  if (ctx.session?.step !== STEPS.FORMAT) return ctx.answerCbQuery();

  const chosen = ctx.match[1];
  const mode = chosen === 'NONE' ? null : chosen;
  ctx.session.post.parse_mode = mode;

  const plan = planService.getEffectivePlan(ctx.state.user);
  if (plan.name === 'free') {
    ctx.session.post.buttons_json = null;
    ctx.session.step = STEPS.TARGETS;
    await ctx.answerCbQuery();
    return safeEdit(ctx, stepTargetsText(ctx), { parse_mode: 'Markdown' });
  }

  ctx.session.step = STEPS.BUTTONS;
  await ctx.answerCbQuery();
  return safeEdit(ctx, stepButtonsText(), {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buildButtonsKeyboard() },
  });
}

async function onNpButtonsSkip(ctx) {
  if (ctx.session?.step !== STEPS.BUTTONS) return ctx.answerCbQuery();

  ctx.session.post.buttons_json = null;
  ctx.session.step = STEPS.TARGETS;

  await ctx.answerCbQuery();
  return safeEdit(ctx, stepTargetsText(ctx), { parse_mode: 'Markdown' });
}

async function onNpType(ctx) {
  if (ctx.session?.step !== STEPS.TYPE) return ctx.answerCbQuery();

  const type = ctx.match[1];
  ctx.session.post.schedule_type = type;

  await ctx.answerCbQuery();

  if (type === SCHEDULE_TYPES.ONCE) {
    ctx.session.step = STEPS.RUN_DATE;
    return safeEdit(ctx, '📅 Envíame la *fecha y hora* en formato `DD/MM/AAAA HH:MM`.\n\nEjemplo: `25/12/2026 09:30`', {
      parse_mode: 'Markdown',
    });
  }

  if (type === SCHEDULE_TYPES.WEEKLY) {
    ctx.session.step = STEPS.WEEKDAY;
    return safeEdit(ctx, '📅 Envíame el *día de la semana* (0=Domingo ... 6=Sábado).', {
      parse_mode: 'Markdown',
    });
  }

  if (type === SCHEDULE_TYPES.MONTHLY) {
    ctx.session.step = STEPS.DAY_OF_MONTH;
    return safeEdit(ctx, '📅 Envíame el *día del mes* (1-31).', {
      parse_mode: 'Markdown',
    });
  }

  ctx.session.step = STEPS.TIME;
  return safeEdit(ctx, '🕒 Envíame la *hora* en formato `HH:MM`.', {
    parse_mode: 'Markdown',
  });
}

async function onNpConfirmYes(ctx) {
  const post = ctx.session?.post;
  if (!post) return ctx.answerCbQuery('❌ Sesión expirada');

  await ctx.answerCbQuery();

  try {
    const result = scheduleService.create(ctx.state.user, post);
    ctx.session.post = null;
    ctx.session.step = null;

    return safeEdit(
      ctx,
      `✅ *Publicación programada*\n\n` +
        `🆔 ID: \`${result.id}\`\n` +
        `📅 Próxima ejecución: *${formatDate(result.next_run)}*\n\n` +
        `Ver todas: /posts`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    ctx.session.post = null;
    ctx.session.step = null;
    return safeEdit(ctx, `❌ ${err.message}`, { parse_mode: 'Markdown' });
  }
}

async function onNpConfirmNo(ctx) {
  ctx.session.post = null;
  ctx.session.step = null;
  await ctx.answerCbQuery('❌ Cancelado');
  return safeEdit(ctx, '❌ Publicación cancelada.', { parse_mode: 'Markdown' });
}

// ============================================================
// FLUJOS DE CAPTURA (foto y texto)
// ============================================================

function registerFlowHandlers(bot) {
  bot.on('photo', async (ctx, next) => {
    // Edición de imagen existente
    if (ctx.session?.editing?.field === EDIT_FIELDS.MEDIA) {
      const postId = ctx.session.editing.postId;
      const fileId = getLargestPhoto(ctx.message.photo);
      scheduleModel.updateMedia(postId, 'photo', fileId);
      ctx.session.editing = null;

      return ctx.reply('✅ Imagen actualizada.', {
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Volver', callback_data: `po:edit:${postId}` }]],
        },
      });
    }

    // Flujo /newpost: paso MEDIA
    if (ctx.session?.step !== STEPS.MEDIA) return next();

    ctx.session.post.media_type = 'photo';
    ctx.session.post.media_file_id = getLargestPhoto(ctx.message.photo);
    ctx.session.step = STEPS.FORMAT;

    return ctx.reply(stepFormatText(), {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buildFormatKeyboard() },
    });
  });

  bot.use(async (ctx, next) => {
    if (!ctx.message?.text) return next();

    // 1. Edición de campo
    if (ctx.session?.editing) {
      return handleEditingInput(ctx);
    }

    // 2. Flujo /newpost
    if (ctx.session?.step && ctx.session?.post) {
      return handleNewPostInput(ctx, next);
    }

    return next();
  });
}

async function handleEditingInput(ctx) {
  const { postId, field } = ctx.session.editing;
  const text = ctx.message.text.trim();

  try {
    const result = await applyEdit(ctx, postId, field, text);
    ctx.session.editing = null;

    if (!result) return;

    const goBack = {
      reply_markup: {
        inline_keyboard: [[{ text: '⬅️ Volver a editar', callback_data: `po:edit:${postId}` }]],
      },
    };

    return ctx.reply(result, goBack);
  } catch (err) {
    ctx.session.editing = null;
    return ctx.reply(`❌ ${err.message}`);
  }
}

async function applyEdit(ctx, postId, field, text) {
  const s = scheduleModel.findById(postId);
  if (!s) throw new Error('Publicación no encontrada');

  switch (field) {
    case EDIT_FIELDS.CONTENT:
      scheduleModel.updateContent(postId, text);
      return '✅ Contenido actualizado.';

    case EDIT_FIELDS.BUTTONS: {
      const json = parseButtonsInputOrNull(text);
      scheduleModel.updateButtons(postId, json);
      return '✅ Botones actualizados.';
    }

    case EDIT_FIELDS.TARGETS: {
      const selected = resolveTargetsFromInput(ctx, text);
      if (!selected.length) throw new Error('Índices no válidos');
      scheduleModel.setTargets(postId, selected);
      return `✅ Destinos actualizados (${selected.length}).`;
    }

    case EDIT_FIELDS.TIME: {
      const { hour, minute } = parseTimeInput(text);
      scheduleModel.updateTime(postId, hour, minute);
      await recalcNextRun(postId);
      return `✅ Hora actualizada a ${pad(hour)}:${pad(minute)}.`;
    }

    case EDIT_FIELDS.RUN_DATE: {
      const date = parseRunDateInput(text);
      scheduleModel.updateRunDate(
        postId,
        date.toISOString(),
        date.getHours(),
        date.getMinutes()
      );
      scheduleModel.updateNextRun(postId, date.toISOString());
      return `✅ Fecha actualizada a ${formatDate(date)}.`;
    }

    case EDIT_FIELDS.WEEKDAY: {
      const wd = parseWeekdayInput(text);
      scheduleModel.updateWeekday(postId, wd);
      await recalcNextRun(postId);
      return `✅ Día actualizado a ${WEEKDAYS[wd]}.`;
    }

    case EDIT_FIELDS.DAY_OF_MONTH: {
      const dom = parseDayOfMonthInput(text);
      scheduleModel.updateDayOfMonth(postId, dom);
      await recalcNextRun(postId);
      return `✅ Día del mes actualizado a ${dom}.`;
    }

    default:
      throw new Error('Campo de edición desconocido');
  }
}

async function handleNewPostInput(ctx, next) {
  const step = ctx.session.step;
  const text = ctx.message.text.trim();
  const post = ctx.session.post;

  try {
    switch (step) {
      case STEPS.CONTENT:
        post.content = text;
        ctx.session.step = STEPS.MEDIA;
        return ctx.reply(stepMediaText(), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buildMediaKeyboard() },
        });

      case STEPS.MEDIA:
        return ctx.reply('📸 Envía una imagen o pulsa *Saltar*.', {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buildMediaKeyboard() },
        });

      case STEPS.FORMAT:
        return ctx.reply('Por favor, elige una opción del menú.', {
          reply_markup: { inline_keyboard: buildFormatKeyboard() },
        });

      case STEPS.BUTTONS: {
        const json = parseButtonsInputOrNull(text);
        post.buttons_json = json;
        ctx.session.step = STEPS.TARGETS;
        return ctx.reply(stepTargetsText(ctx), { parse_mode: 'Markdown' });
      }

      case STEPS.TARGETS: {
        const selected = resolveTargetsFromInput(ctx, text);
        if (!selected.length) {
          return ctx.reply('❌ Índices no válidos. Intenta de nuevo.');
        }
        post.targets = selected;
        ctx.session.step = STEPS.TYPE;
        return ctx.reply(stepTypeText(), {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buildTypeKeyboard() },
        });
      }

      case STEPS.RUN_DATE: {
        const date = parseRunDateInput(text);
        post.run_date = date.toISOString();
        post.hour = date.getHours();
        post.minute = date.getMinutes();
        return askConfirm(ctx, post);
      }

      case STEPS.WEEKDAY: {
        const wd = parseWeekdayInput(text);
        post.weekday = wd;
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          `Día: *${WEEKDAYS[wd]}*.\n\n🕒 Envíame la *hora* en formato \`HH:MM\`.`,
          { parse_mode: 'Markdown' }
        );
      }

      case STEPS.DAY_OF_MONTH: {
        const dom = parseDayOfMonthInput(text);
        post.day_of_month = dom;
        ctx.session.step = STEPS.TIME;
        return ctx.reply(
          `Día del mes: *${dom}*.\n\n🕒 Envíame la *hora* en formato \`HH:MM\`.`,
          { parse_mode: 'Markdown' }
        );
      }

      case STEPS.TIME: {
        const { hour, minute } = parseTimeInput(text);
        post.hour = hour;
        post.minute = minute;
        return askConfirm(ctx, post);
      }

      case STEPS.CONFIRM:
        return handleTextConfirm(ctx, text, post);

      default:
        return next();
    }
  } catch (err) {
    ctx.session.post = null;
    ctx.session.step = null;
    return ctx.reply(`❌ ${err.message}`);
  }
}

async function handleTextConfirm(ctx, text, post) {
  if (CONFIRM_YES_WORDS.includes(text.toLowerCase())) {
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

// ============================================================
// BUILDERS DE TECLADOS
// ============================================================

function buildMediaKeyboard() {
  return [[{ text: '⏭ Saltar imagen', callback_data: 'np:media:skip' }]];
}

function buildFormatKeyboard() {
  return [
    [{ text: '1️⃣ HTML (recomendado)', callback_data: 'np:format:HTML' }],
    [{ text: '2️⃣ MarkdownV2', callback_data: 'np:format:MarkdownV2' }],
    [{ text: '3️⃣ Sin formato', callback_data: 'np:format:NONE' }],
  ];
}

function buildButtonsKeyboard() {
  return [[{ text: '⏭ Saltar botones', callback_data: 'np:buttons:skip' }]];
}

function buildTypeKeyboard() {
  return [
    [{ text: '1️⃣ Una vez', callback_data: 'np:type:once' }],
    [{ text: '2️⃣ Diaria', callback_data: 'np:type:daily' }],
    [{ text: '3️⃣ Semanal', callback_data: 'np:type:weekly' }],
    [{ text: '4️⃣ Mensual', callback_data: 'np:type:monthly' }],
  ];
}

function buildConfirmKeyboard() {
  return [
    [
      { text: '✅ Confirmar', callback_data: 'np:confirm:yes' },
      { text: '❌ Cancelar', callback_data: 'np:confirm:no' },
    ],
  ];
}

function buildPostKeyboard(s) {
  return {
    inline_keyboard: [
      [
        s.is_active
          ? { text: '⏸ Pausar', callback_data: `po:pause:${s.id}` }
          : { text: '▶️ Reanudar', callback_data: `po:resume:${s.id}` },
        { text: '📜 Ver log', callback_data: `po:log:${s.id}` },
      ],
      [
        { text: '✏️ Editar', callback_data: `po:edit:${s.id}` },
        { text: '🗑 Borrar', callback_data: `po:del:${s.id}` },
      ],
      [{ text: '⬅️ Volver', callback_data: 'po:back' }],
    ],
  };
}

// ============================================================
// TEXTOS DE PASOS
// ============================================================

function stepMediaText() {
  return 'Paso 2/6: ¿Quieres añadir una *imagen*?\n\n📸 Envía una foto, o pulsa *Saltar*.';
}

function stepFormatText() {
  return (
    'Paso 3/6: Elige el *formato del texto*:\n\n' +
    '1️⃣ HTML (recomendado)\n' +
    '   `<b>negrita</b>`, `<i>cursiva</i>`, `<s>tachado</s>`\n' +
    '   `<blockquote>cita</blockquote>`\n\n' +
    '2️⃣ MarkdownV2 (avanzado)\n' +
    '   Requiere escapar `_ * [ ] ( ) ~ ` > # + - = | { } . !`\n\n' +
    '3️⃣ Sin formato'
  );
}

function stepButtonsText() {
  return (
    'Paso 4/6: *Botones con enlace* (opcional)\n\n' +
    '`Texto del botón | https://url.com`\n\n' +
    '📌 Varios en la misma fila: sepáralos con `;;`\n' +
    '📌 Filas distintas: uno por línea\n\n' +
    'Ejemplo:\n' +
    '`📢 Canal | https://t.me/mi_canal ;; 💬 Grupo | https://t.me/mi_grupo`\n\n' +
    'Pulsa *Saltar* para continuar sin botones.'
  );
}

function stepTargetsText(ctx) {
  const channels = channelModel.getByUser(ctx.state.user.id);
  const lines = channels.map(
    (c, i) => `${i + 1}. ${escapeMd(c.title || c.chat_id)} (\`${c.chat_id}\`)`
  );
  return (
    'Paso 5/6: Elige los *destinos* (varios números separados por comas).\n\n' +
    lines.join('\n')
  );
}

function stepTypeText() {
  return 'Paso 6/6: Elige el *tipo de programación*:';
}

function stepConfirmText(post) {
  const typeLabel = SCHEDULE_TYPE_LABELS[post.schedule_type];
  const when = describeWhen(post);

  let extras = '';
  if (post.media_type === 'photo') extras += '🖼 Con imagen\n';
  if (post.buttons_json) {
    try {
      const rows = JSON.parse(post.buttons_json);
      const total = rows.reduce((acc, r) => acc + r.length, 0);
      extras += `🔘 ${total} botón(es)\n`;
    } catch (_) {}
  }
  if (post.parse_mode) extras += `🎨 ${post.parse_mode}\n`;

  return (
    `📋 *Resumen*\n\n` +
    `🎯 Destinos: ${post.targets.length}\n` +
    `🔁 Tipo: ${typeLabel}\n` +
    `⏰ Cuándo: ${when}\n` +
    (extras ? `\n${extras}` : '') +
    `\n¿Confirmas la programación?`
  );
}

async function askConfirm(ctx, post) {
  ctx.session.step = STEPS.CONFIRM;

  await ctx.reply('👁 *Vista previa de tu publicación:*', {
    parse_mode: 'Markdown',
  });

  const preview = await sendPreview(ctx, post);

  if (!preview.ok) {
    return ctx.reply(
      `⚠️ *La vista previa falló*\n\n` +
        `Error: \`${escapeMd(preview.error)}\`\n\n` +
        `La publicación podría fallar al enviarse.`,
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply(stepConfirmText(post), {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buildConfirmKeyboard() },
  });
}

// ============================================================
// HELPERS DE PARSING
// ============================================================

function parseTimeInput(text) {
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error('Formato inválido. Usa HH:MM');
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error('Hora inválida');
  return { hour, minute };
}

function parseRunDateInput(text) {
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error('Formato inválido. Usa DD/MM/AAAA HH:MM');
  const [, dd, mm, yyyy, hh, min] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  if (isNaN(d)) throw new Error('Fecha inválida');
  if (d <= new Date()) throw new Error('La fecha debe ser futura');
  return d;
}

function parseWeekdayInput(text) {
  const wd = Number(text);
  if (isNaN(wd) || wd < 0 || wd > 6) throw new Error('Día inválido (0-6)');
  return wd;
}

function parseDayOfMonthInput(text) {
  const dom = Number(text);
  if (isNaN(dom) || dom < 1 || dom > 31) throw new Error('Día inválido (1-31)');
  return dom;
}

function parseButtonsInputOrNull(text) {
  if (CONFIRM_SKIP_WORDS.includes(text.toLowerCase())) return null;

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows = [];

  for (const line of lines) {
    const buttons = line.split(';;').map((b) => b.trim());
    const row = [];

    for (const btn of buttons) {
      const parts = btn.split('|').map((p) => p.trim());
      if (parts.length !== 2) {
        throw new Error(`Formato incorrecto: "${btn}". Usa "Texto | https://url.com"`);
      }
      const [label, url] = parts;
      if (!/^https?:\/\//.test(url)) {
        throw new Error(`La URL debe empezar por http o https: "${url}"`);
      }
      row.push({ text: label, url, style: null });
    }

    if (row.length) rows.push(row);
  }

  if (!rows.length) throw new Error('No detecté botones válidos');
  return JSON.stringify(rows);
}

function resolveTargetsFromInput(ctx, text) {
  const channels = channelModel.getByUser(ctx.state.user.id);
  const indexes = text
    .split(/[,\s]+/)
    .map((n) => Number(n))
    .filter((n) => !isNaN(n) && n > 0);

  return indexes.map((i) => channels[i - 1]?.chat_id).filter(Boolean);
}

// ============================================================
// HELPERS DE FORMATO / UI
// ============================================================

function buildPostHeader(s) {
  const targets = scheduleModel.getTargets(s.id);
  const status = s.is_active ? '🟢 Activa' : '⏸ Pausada';

  let extras = '';
  if (s.media_type === 'photo') extras += '🖼 Con imagen\n';
  if (s.buttons_json) {
    try {
      const rows = JSON.parse(s.buttons_json);
      const total = rows.reduce((acc, r) => acc + r.length, 0);
      extras += `🔘 ${total} botón(es)\n`;
    } catch (_) {}
  }
  if (s.parse_mode) extras += `🎨 Formato: ${s.parse_mode}\n`;

  return (
    `📝 *Publicación #${s.id}*\n\n` +
    `Estado: ${status}\n` +
    `Tipo: ${SCHEDULE_TYPE_LABELS[s.schedule_type]}\n` +
    `Destinos: ${targets.length}\n` +
    `Próxima: ${s.next_run ? formatDate(s.next_run) : '—'}\n` +
    (extras ? `\n${extras}` : '')
  );
}

function describeWhen(post) {
  switch (post.schedule_type) {
    case 'once':
      return formatDate(post.run_date);
    case 'weekly':
      return `Cada ${WEEKDAYS[post.weekday]} a las ${pad(post.hour)}:${pad(post.minute)}`;
    case 'monthly':
      return `Día ${post.day_of_month} de cada mes a las ${pad(post.hour)}:${pad(post.minute)}`;
    default:
      return `Todos los días a las ${pad(post.hour)}:${pad(post.minute)}`;
  }
}

async function refreshHeader(ctx, s) {
  try {
    await ctx.editMessageText(buildPostHeader(s), {
      parse_mode: 'Markdown',
      reply_markup: buildPostKeyboard(s),
    });
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      console.error('Error refrescando cabecera:', err.message);
    }
  }
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

async function showPostsList(ctx, edit = false) {
  const list = scheduleModel.getByUser(ctx.state.user.id);

  const text = list.length
    ? '📋 *Tus publicaciones:*\n\nSelecciona una para gestionarla.'
    : '📭 No tienes publicaciones.\nUsa /newpost para crear una.';

  const keyboard = list.map((s) => [
    {
      text: `${s.is_active ? '🟢' : '⏸'} #${s.id} — ${s.schedule_type} — ${truncate(s.content, 35)}`,
      callback_data: `po:view:${s.id}`,
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

async function sendPostPreview(ctx, s) {
  return sendPreview(ctx, s);
}

async function sendPreview(ctx, post) {
  const replyMarkup = post.buttons_json ? parseButtonsJson(post.buttons_json) : null;
  const parseMode = post.parse_mode || null;

  const options = {
    ...(parseMode ? { parse_mode: parseMode } : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };

  try {
    if (post.media_type === 'photo' && post.media_file_id) {
      await ctx.replyWithPhoto(post.media_file_id, { caption: post.content, ...options });
    } else {
      await ctx.reply(post.content, options);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ============================================================
// HELPERS GENÉRICOS
// ============================================================

async function findUserPost(ctx) {
  const id = Number(ctx.match[1]);
  const s = scheduleModel.findById(id);

  if (!s || s.user_id !== ctx.state.user.id) {
    await ctx.answerCbQuery('❌ No encontrada');
    return null;
  }
  return s;
}

async function recalcNextRun(id) {
  const updated = scheduleModel.findById(id);
  if (!updated) return;
  try {
    const next = calculateNextRun(updated, new Date());
    scheduleModel.updateNextRun(id, next.toISOString());
  } catch (err) {
    console.warn('No se pudo recalcular next_run:', err.message);
  }
}

function formatLogsText(id, logs) {
  const rows = logs.map((l) => {
    const icon = LOG_STATUS_ICONS[l.status] || '❌';
    const err = l.error ? `\n     \`${escapeMd(l.error.slice(0, 60))}\`` : '';
    return `${icon} \`${l.chat_id}\` — ${new Date(l.sent_at).toLocaleString()}${err}`;
  });
  return `📜 *Últimos envíos de #${id}*\n\n${rows.join('\n\n')}`;
}

function getLargestPhoto(photos) {
  return photos[photos.length - 1].file_id;
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