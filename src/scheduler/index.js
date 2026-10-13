const cron = require('node-cron');
const scheduleModel = require('../models/scheduleModel');
const jobRunner = require('./jobRunner');

let isRunning = false; // evita solapamiento

function startScheduler(bot) {
  // Cada minuto en el segundo 0
  cron.schedule('* * * * *', async () => {
    if (isRunning) {
      console.log('⚠️ Tick anterior aún en curso, se omite este.');
      return;
    }
    isRunning = true;

    try {
      const nowIso = new Date().toISOString();
      const due = scheduleModel.getDue(nowIso);

      if (due.length) {
        console.log(`🔎 ${due.length} publicación(es) pendiente(s).`);
      }

      for (const schedule of due) {
        try {
          await jobRunner.run(bot, schedule);
        } catch (err) {
          console.error(`❌ Error ejecutando schedule #${schedule.id}:`, err.message);
        }
      }
    } finally {
      isRunning = false;
    }
  });

  console.log('⏰ Scheduler iniciado (revisión cada minuto)');
}

module.exports = { startScheduler };