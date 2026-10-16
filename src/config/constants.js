// src/config/constants.js

// ============================================================
// PLANES
// ============================================================
const PLANS = Object.freeze({
  free: {
    name: 'free',
    label: '🆓 Gratis',
    maxChannels: 1,
    maxSchedules: 1,
    maxTargetsPerSchedule: 1,
    priceStars: 0,
    durationDays: null,
  },
  basic: {
    name: 'basic',
    label: '⭐ Básico',
    maxChannels: 5,
    maxSchedules: 20,
    maxTargetsPerSchedule: 5,
    priceStars: 100,
    durationDays: 30,
  },
  premium: {
    name: 'premium',
    label: '💎 Premium',
    maxChannels: 20,
    maxSchedules: 200,
    maxTargetsPerSchedule: 20,
    priceStars: 300,
    durationDays: 30,
  },
});

// ============================================================
// TIPOS DE PROGRAMACIÓN
// ============================================================
const SCHEDULE_TYPES = Object.freeze({
  ONCE: 'once',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
});

const SCHEDULE_TYPE_LABELS = Object.freeze({
  once: 'Una vez',
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
});

// ============================================================
// FLUJO /newpost — Pasos del asistente
// ============================================================
const POST_STEPS = Object.freeze({
  CONTENT: 'content',
  MEDIA: 'media',
  FORMAT: 'format',
  BUTTONS: 'buttons',
  TARGETS: 'targets',
  TYPE: 'type',
  TIME: 'time',
  WEEKDAY: 'weekday',
  DAY_OF_MONTH: 'day_of_month',
  RUN_DATE: 'run_date',
  CONFIRM: 'confirm',
});

// ============================================================
// EDICIÓN — Campos editables de una publicación
// ============================================================
const POST_EDIT_FIELDS = Object.freeze({
  CONTENT: 'content',
  MEDIA: 'media',
  BUTTONS: 'buttons',
  TARGETS: 'targets',
  TIME: 'time',
  RUN_DATE: 'run_date',
  WEEKDAY: 'weekday',
  DAY_OF_MONTH: 'day_of_month',
});

// ============================================================
// FORMATOS DE TEXTO soportados por Telegram
// ============================================================
const POST_FORMATS = Object.freeze({
  MARKDOWNV2: 'MarkdownV2',
  HTML: 'HTML',
  NONE: null,
});

// ============================================================
// CALLBACKS generales
// ============================================================
const CALLBACK = Object.freeze({
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
});

// ============================================================
// PALABRAS de confirmación
// ============================================================
const CONFIRM_YES_WORDS = Object.freeze(['sí', 'si', 's', 'yes', 'y']);
const CONFIRM_SKIP_WORDS = Object.freeze(['saltar', 'no', '0', 'skip']);

// ============================================================
// ICONOS de estado de logs
// ============================================================
const LOG_STATUS_ICONS = Object.freeze({
  success: '✅',
  fatal: '💀',
  failed: '❌',
});

// ============================================================
// DÍAS DE LA SEMANA
// ============================================================
const WEEKDAYS = Object.freeze({
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
});

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  // Planes
  PLANS,

  // Programación
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_LABELS,

  // Flujo /newpost
  POST_STEPS,

  // Edición
  POST_EDIT_FIELDS,

  // Formatos
  POST_FORMATS,

  // Callbacks
  CALLBACK,

  // Confirmaciones
  CONFIRM_YES_WORDS,
  CONFIRM_SKIP_WORDS,

  // Logs
  LOG_STATUS_ICONS,

  // Utilidades de fecha
  WEEKDAYS,
};