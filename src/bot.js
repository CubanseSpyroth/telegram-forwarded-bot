require('dotenv').config();
const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');

const { BOT_TOKEN, PROXY_URL } = require('./config/env');
const { runMigrations } = require('./database/migrations');

const userMiddleware = require('./middlewares/userMiddleware');

const registerMeHandler = require('./handlers/meHandler');
const registerChannelHandler = require('./handlers/channelHandler');
const registerPostHandler = require('./handlers/postHandler');

const { startScheduler } = require('./scheduler');

console.log('🚀 Iniciando bot...');
runMigrations();

// Opciones del bot (con proxy opcional)
let botOptions = {};
if (PROXY_URL) {
  botOptions.telegram = { agent: new SocksProxyAgent(PROXY_URL) };
}

const bot = new Telegraf(BOT_TOKEN, botOptions);

// --- Sesiones locales (persisten en ./sessions.json) ---
const localSession = new LocalSession({ database: 'sessions.json' });
bot.use(localSession.middleware());
bot.use((ctx, next) => {
  if (!ctx.session) ctx.session = {};
  return next();
});

// --- Middleware global de usuario ---
bot.use(userMiddleware());

// --- Handlers ---
bot.start((ctx) => {
  const name = ctx.from.first_name || 'amigo';
  return ctx.reply(
    `¡Hola ${name}! 👋\n\nSoy tu bot programador de publicaciones.\nUsa /help para ver los comandos.`
  );
});

bot.help((ctx) => {
  return ctx.reply(
    `📖 *Comandos disponibles:*\n\n` +
      `/start - Iniciar\n` +
      `/me - Ver tu cuenta y plan\n` +
      `/addchannel - Añadir un canal o grupo\n` +
      `/channels - Ver tus canales\n` +
      `/help - Esta ayuda`, +
      `/newpost - Programar publicación\n` +
      `/posts - Ver publicaciones\n` +
      `/pause <ID> - Pausar\n` +
      `/resume <ID> - Reactivar\n` +
      `/delpost <ID> - Eliminar\n` +
    { parse_mode: 'Markdown' }
  );
});

registerMeHandler(bot);
registerChannelHandler(bot);
registerPostHandler(bot);

startScheduler(bot);

// --- Manejo de errores ---
bot.catch((err, ctx) => {
  console.error(`❌ Error en ${ctx.updateType}:`, err.message);
});

// --- Lanzar ---
bot.launch()
  .then(() => console.log('🤖 Bot listo y escuchando'))
  .catch((err) => {
    console.error('❌ Error al lanzar el bot:', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));