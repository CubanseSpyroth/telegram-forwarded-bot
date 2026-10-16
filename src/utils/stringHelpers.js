// src/utils/stringHelpers.js

/**
 * Escapa caracteres reservados de Markdown legacy (parse_mode: 'Markdown').
 * Solo los 4 caracteres que realmente rompen el parseo:
 *   _  *  `  [  ]
 */
function escapeMd(str = '') {
  return String(str).replace(/([_*`\[\]])/g, '\\$1');
}

/**
 * Escapa caracteres reservados de HTML (parse_mode: 'HTML').
 * Solo 3 caracteres:  <  >  &
 */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { escapeMd, escapeHtml };