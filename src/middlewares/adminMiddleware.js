const { Composer } = require('telegraf');
const { ADMIN_IDS } = require('../config/env');

/**
 * Composer que solo ejecuta si el usuario está en ADMIN_IDS.
 */
const adminOnly = Composer.acl(ADMIN_IDS, new Composer());

module.exports = { adminOnly };