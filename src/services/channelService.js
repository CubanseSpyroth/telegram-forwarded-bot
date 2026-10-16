// src/services/channelService.js
const channelModel = require('../models/channelModel');
const planService = require('./planService');
const { parseChannelInput } = require('../utils/channelParser');

// ============================================================
// CONSTANTES
// ============================================================

const ADMIN_STATUSES = ['administrator', 'creator'];

const ERRORS = Object.freeze({
  CANNOT_ACCESS:
    'No puedo acceder a ese canal. Asegúrate de que exista, ' +
    'sea público o que el bot esté añadido como administrador.',
  CANNOT_VERIFY_BOT:
    'No pude verificar mis permisos en ese canal. Inténtalo de nuevo.',
  BOT_NOT_ADMIN:
    'Para publicar necesito ser administrador de ese canal/grupo. ' +
    'Añádeme como admin con permiso para publicar mensajes.',
  CANNOT_VERIFY_USER:
    'No pude verificar tus permisos en ese canal. ' +
    'Asegúrate de que eres administrador.',
  USER_NOT_ADMIN:
    'Solo puedes registrar canales/grupos donde *tú* seas administrador.',
  ALREADY_REGISTERED: 'Ya tienes registrado ese canal.',
});

// ============================================================
// API PÚBLICA
// ============================================================

/**
 * Añade un canal al usuario tras validar:
 *  1. Límite de plan.
 *  2. No duplicado.
 *  3. Bot es admin del canal.
 *  4. Usuario es admin del canal.  ← cierra la vulnerabilidad
 */
async function addChannel(bot, user, rawInput) {
  const { chatId } = parseChannelInput(rawInput);
  const plan = planService.getPlan(user.plan);

  assertPlanLimit(user, plan);
  assertNotDuplicate(user, chatId);

  const chatInfo = await verifyBotAccess(bot, chatId, user.id);

  return channelModel.create({
    userId: user.id,
    chatId,
    title: chatInfo.title,
    type: chatInfo.type,
  });
}

/**
 * Verifica que tanto el bot como el usuario pueden operar en el chat.
 * Devuelve { title, type } si todo está OK. Lanza Error en caso contrario.
 *
 * @param {Telegraf} bot
 * @param {string} chatId
 * @param {number} userId  Telegram user ID del dueño del canal
 */
async function verifyBotAccess(bot, chatId, userId) {
  const chat = await safeGetChat(bot, chatId);
  const botMember = await safeGetMember(bot, chatId, bot.botInfo.id, ERRORS.CANNOT_VERIFY_BOT);
  const userMember = await safeGetMember(bot, chatId, userId, ERRORS.CANNOT_VERIFY_USER);

  assertIsAdmin(botMember, ERRORS.BOT_NOT_ADMIN);
  assertIsAdmin(userMember, ERRORS.USER_NOT_ADMIN);

  return {
    title: chat.title || chat.username || chatId,
    type: chat.type,
  };
}

function listChannels(userId) {
  return channelModel.getByUser(userId);
}

function removeChannel(userId, chatId) {
  const res = channelModel.delete(userId, chatId);
  if (res.changes === 0) {
    throw new Error('No encontré ese canal en tu lista.');
  }
}

// ============================================================
// HELPERS PRIVADOS
// ============================================================

function assertPlanLimit(user, plan) {
  const count = channelModel.countByUser(user.id);
  if (count >= plan.maxChannels) {
    throw new Error(
      `Tu plan ${plan.label} permite máximo ${plan.maxChannels} canal(es). ` +
        'Actualiza tu plan para añadir más.'
    );
  }
}

function assertNotDuplicate(user, chatId) {
  const existing = channelModel.findByUserAndChat(user.id, chatId);
  if (existing) throw new Error(ERRORS.ALREADY_REGISTERED);
}

function assertIsAdmin(member, errorMessage) {
  if (!ADMIN_STATUSES.includes(member.status)) {
    throw new Error(errorMessage);
  }
}

async function safeGetChat(bot, chatId) {
  try {
    return await bot.telegram.getChat(chatId);
  } catch {
    throw new Error(ERRORS.CANNOT_ACCESS);
  }
}

async function safeGetMember(bot, chatId, userId, errorMessage) {
  try {
    return await bot.telegram.getChatMember(chatId, userId);
  } catch {
    throw new Error(errorMessage);
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  addChannel,
  verifyBotAccess,
  listChannels,
  removeChannel,
};