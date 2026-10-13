require('dotenv').config();

if (!process.env.BOT_TOKEN) {
  throw new Error('❌ Falta BOT_TOKEN en el archivo .env');
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  DB_PATH: process.env.DB_PATH || './database/bot.sqlite',
  ADMIN_IDS: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number),
};