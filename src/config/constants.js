module.exports = {
  PLANS: {
    free: {
      name: 'free',
      label: '🆓 Gratis',
      maxChannels: 1,
      maxSchedules: 1,
      maxTargetsPerSchedule: 1,
    },
    basic: {
      name: 'basic',
      label: '⭐ Básico',
      maxChannels: 5,
      maxSchedules: 20,
      maxTargetsPerSchedule: 5,
    },
    premium: {
      name: 'premium',
      label: '💎 Premium',
      maxChannels: 20,
      maxSchedules: 200,
      maxTargetsPerSchedule: 20,
    },
  },

  SCHEDULE_TYPES: {
    ONCE: 'once',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
  },

  CALLBACK: {
    CONFIRM: 'confirm',
    CANCEL: 'cancel',
  },
};