const channelModel = require('../models/channelModel');
const planService = require('./planService');
const { parseChannelInput } = require('../utils/channelParser');

module.exports = {
  /**
   * Añade un canal al usuario tras validar plan y permisos del bot.
   */
  async addChannel(bot, user, rawInput) {
    const { chatId } = parseChannelInput(rawInput);
    const plan = planService.getPlan(user.plan);

    // 1. Verificar límite del plan
    const count = channelModel.countByUser(user.id);
    if (count >= plan.maxChannels) {
      throw new Error(
        `Tu plan ${plan.label} permite máximo ${plan.maxChannels} canal(es). ` +
          `Actualiza tu plan para añadir más.`
      );
    }

    // 2. Evitar duplicados
    const existing = channelModel.findByUserAndChat(user.id, chatId);
    if (existing) {
      throw new Error('Ya tienes registrado ese canal.');
    }

    // 3. Verificar que el bot puede publicar ahí
    const chatInfo = await this.verifyBotAccess(bot, chatId);

    // 4. Guardar
    return channelModel.create({
      userId: user.id,
      chatId,
      title: chatInfo.title,
      type: chatInfo.type,
    });
  },

  /**
   * Comprueba que el bot es admin/está en el chat.
   * Devuelve info básica del chat.
   */
  async verifyBotAccess(bot, chatId) {
    let chat;
    try {
      chat = await bot.telegram.getChat(chatId);
    } catch (err) {
      throw new Error(
        'No puedo acceder a ese canal. Asegúrate de que exista, ' +
          'sea público o que el bot esté añadido como administrador.'
      );
    }

    // Comprobar permisos de administrador
    let me;
    try {
      me = await bot.telegram.getChatMember(chatId, bot.botInfo.id);
    } catch (err) {
      throw new Error('No pude verificar mis permisos en ese canal.');
    }

    const isAdmin = ['administrator', 'creator'].includes(me.status);
    if (!isAdmin) {
      throw new Error(
        'Para publicar necesito ser administrador de ese canal/grupo. ' +
          'Añádeme como admin con permiso para publicar mensajes.'
      );
    }

    return {
      title: chat.title || chat.username || chatId,
      type: chat.type, // channel | group | supergroup
    };
  },

  listChannels(userId) {
    return channelModel.getByUser(userId);
  },

  removeChannel(userId, chatId) {
    const res = channelModel.delete(userId, chatId);
    if (res.changes === 0) {
      throw new Error('No encontré ese canal en tu lista.');
    }
  },
};