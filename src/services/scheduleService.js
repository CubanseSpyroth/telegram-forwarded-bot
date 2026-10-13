const scheduleModel = require('../models/scheduleModel');
const channelModel = require('../models/channelModel');
const planService = require('./planService');
const { calculateNextRun } = require('../utils/dateHelpers');

module.exports = {
  create(user, data) {
    const plan = planService.getPlan(user.plan);

    // 1. Límite de programaciones
    const current = scheduleModel.countByUser(user.id);
    if (current >= plan.maxSchedules) {
      throw new Error(
        `Tu plan ${plan.label} permite máximo ${plan.maxSchedules} publicación(es) activa(s).`
      );
    }

    // 2. Validar destinos
    if (!data.targets || !data.targets.length) {
      throw new Error('Debes seleccionar al menos un destino.');
    }
    if (data.targets.length > plan.maxTargetsPerSchedule) {
      throw new Error(
        `Tu plan permite máximo ${plan.maxTargetsPerSchedule} destino(s) por publicación.`
      );
    }

    // 3. Verificar que los destinos pertenecen al usuario
    const userChannels = channelModel.getByUser(user.id).map((c) => c.chat_id);
    const invalid = data.targets.filter((t) => !userChannels.includes(t));
    if (invalid.length) {
      throw new Error(
        `No tienes registrados estos destinos: ${invalid.join(', ')}`
      );
    }

    // 4. Calcular próxima ejecución
    const nextRun = calculateNextRun(data);

    // 5. Guardar
    const scheduleId = scheduleModel.create({
      user_id: user.id,
      content: data.content,
      schedule_type: data.schedule_type,
      hour: data.hour,
      minute: data.minute,
      weekday: data.weekday,
      day_of_month: data.day_of_month,
      run_date: data.run_date,
      next_run: nextRun.toISOString(),
    });

    for (const chatId of data.targets) {
      scheduleModel.addTarget(scheduleId, chatId);
    }

    return { id: scheduleId, next_run: nextRun };
  },
};