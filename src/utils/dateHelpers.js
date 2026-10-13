const { SCHEDULE_TYPES } = require('../config/constants');

/**
 * Calcula la próxima fecha de ejecución según el tipo de programación.
 * @returns {Date}
 */
function calculateNextRun(schedule, from = new Date()) {
  const now = new Date(from);
  const { schedule_type, hour, minute, weekday, day_of_month, run_date } = schedule;

  switch (schedule_type) {
    case SCHEDULE_TYPES.ONCE: {
      const d = new Date(run_date);
      if (d <= now) {
        throw new Error('La fecha programada ya pasó.');
      }
      return d;
    }

    case SCHEDULE_TYPES.DAILY: {
      const next = new Date(now);
      next.setHours(hour, minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      return next;
    }

    case SCHEDULE_TYPES.WEEKLY: {
      const next = new Date(now);
      next.setHours(hour, minute, 0, 0);
      const currentDay = next.getDay();
      let diff = (weekday - currentDay + 7) % 7;
      if (diff === 0 && next <= now) diff = 7;
      next.setDate(next.getDate() + diff);
      return next;
    }

    case SCHEDULE_TYPES.MONTHLY: {
      const next = new Date(now);
      next.setHours(hour, minute, 0, 0);
      next.setDate(day_of_month);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(day_of_month);
      }
      return next;
    }

    default:
      throw new Error(`Tipo de programación desconocido: ${schedule_type}`);
  }
}

/**
 * Formatea una fecha para mostrar al usuario.
 */
function formatDate(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Nombres de días en español (0 = domingo).
 */
const WEEKDAYS = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

module.exports = { calculateNextRun, formatDate, WEEKDAYS };