const cron = require('node-cron');
const logModel = require('../models/logModel');

const LOG_RETENTION_DAYS = 30;

function startCleanup() {
  // Todos los días a las 03:00 AM
  cron.schedule('0 3 * * *', () => {
    try {
      const before = logModel.count();
      const res = logModel.deleteOlderThan(LOG_RETENTION_DAYS);
      const after = logModel.count();
      console.log(
        `🧹 Limpieza: ${res.changes} logs borrados (${before} → ${after})`
      );
    } catch (err) {
      console.error('❌ Error en limpieza:', err.message);
    }
  });

  console.log('🧹 Limpieza diaria programada (03:00 AM)');
}

module.exports = { startCleanup };