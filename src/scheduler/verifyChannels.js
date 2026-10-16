// src/scheduler/verifyChannels.js
const cron = require('node-cron');
const db = require('../database/connection');

async function verifyAllChannels(bot) {
  const channels = db
    .prepare('SELECT * FROM channels')
    .all();

  for (const ch of channels) {
    try {
      const member = await bot.telegram.getChatMember(ch.chat_id, ch.user_id);
      const isAdmin = ['administrator', 'creator'].includes(member.status);

      if (!isAdmin) {
        console.log(`⚠️ Usuario ${ch.user_id} ya no es admin de ${ch.chat_id}. Eliminando.`);
        db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
      }
    } catch (err) {
      // Canal inaccesible o bot expulsado → eliminar
      if (
        err.message.includes('chat not found') ||
        err.message.includes('bot was kicked') ||
        err.message.includes('user not found')
      ) {
        console.log(`⚠️ Canal ${ch.chat_id} inaccesible. Eliminando.`);
        db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
      }
    }

    // Pequeña pausa para no saturar la API
    await new Promise((r) => setTimeout(r, 100));
  }
}

function startChannelVerification(bot) {
  // Todos los días a las 04:00 AM
  cron.schedule('0 4 * * *', async () => {
    console.log('🔍 Verificando permisos de canales...');
    await verifyAllChannels(bot);
    console.log('✅ Verificación completada');
  });
}

module.exports = { startChannelVerification };