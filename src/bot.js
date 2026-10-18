// src/bot.js
require('dotenv').config();
const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');

const { BOT_TOKEN, ADMIN_IDS } = require('./config/env');
const { runMigrations } = require('./database/migrations');

const userMiddleware = require('./middlewares/userMiddleware');

const registerPostHandler = require('./handlers/postHandler');
const registerMeHandler = require('./handlers/meHandler');
const registerChannelHandler = require('./handlers/channelHandler');
const registerPlanHandler = require('./handlers/planHandler');
const registerAdminHandler = require('./handlers/adminHandler');

const { startScheduler } = require('./scheduler');
const { startCleanup } = require('./scheduler/cleanup');

// ============================================================
// INICIO
// ============================================================

console.log('🚀 Iniciando bot...');
runMigrations();

// ============================================================
// BOT
// ============================================================

const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 30_000 });

// ------------------------------------------------------------
// 1. Sesiones
// ------------------------------------------------------------
const localSession = new LocalSession({ database: 'sessions.json' });
bot.use(localSession.middleware());
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  return next();
});

// ------------------------------------------------------------
// 2. Usuario (DEBE IR ANTES DE TODOS LOS HANDLERS)
// ------------------------------------------------------------
bot.use(userMiddleware());

// ============================================================
// COMANDOS BASE
// ============================================================

bot.start(async (ctx) => {
  const name = ctx.from?.first_name || 'amigo';
  return ctx.reply(
    `¡Hola ${name}! 👋\n\n` +
      `Soy tu bot programador de publicaciones.\n` +
      `Puedo publicar automáticamente en tus canales y grupos.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 Añadir canal', callback_data: 'start:addchannel' }
          ],
          [
            { text: '👤 Mi información', callback_data: 'start:me' }
          ],
        ],
      },
    }
  );
});

bot.help(async (ctx) => {
  let text =
    `📖 *Comandos disponibles:*\n\n` +
    `/start - Iniciar\n` +
    `/me - Ver tu cuenta y plan\n` +
    `/addchannel - Añadir un canal o grupo\n` +
    `/channels - Ver tus canales\n` +
    `/newpost - Programar publicación\n` +
    `/posts - Ver publicaciones\n` +
    `/plans - Ver planes y comprar\n` +
    `/cancel - Cancelar operación\n` +
    `/help - Esta ayuda`;

  if (ADMIN_IDS.includes(ctx.from?.id)) {
    text += `\n\n🛠 *Admin:*\n/admin - Panel de administración`;
  }

  return ctx.reply(text, { parse_mode: 'Markdown' });
});

registerPostHandler(bot);
registerMeHandler(bot);
registerChannelHandler(bot);
registerPlanHandler(bot);
registerAdminHandler(bot);

// ============================================================
// MANEJO DE ERRORES
// ============================================================

bot.catch((err, ctx) => {
  console.error(`❌ Error en ${ctx.updateType}:`, err.message);
});

// ============================================================
// LANZAR
// ============================================================

startScheduler(bot);
startCleanup();

bot
  .launch()
  .then(() => {
    console.log('🤖 Bot listo y escuchando');
    // startScheduler(bot);
    // startCleanup();
  })
  .catch((err) => {
    console.error('❌ Error al lanzar el bot:', err);
    process.exit(1);
  });

// ============================================================
// APAGADO LIMPIO
// ============================================================

let isShuttingDown = false;
const shutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n👋 Cerrando bot por ${signal}...`);
  try {
    if (bot.botInfo) bot.stop(signal);
  } catch (err) {
    console.warn('Aviso al cerrar:', err.message);
  }
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));