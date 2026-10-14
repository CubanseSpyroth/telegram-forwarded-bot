const InlineKeyboardBuilder = require('telegram-inline-keyboard-builder');

/**
 * Construye un teclado inline con botones URL y colores opcionales.
 * @param {Array} rows - Array de filas. Cada fila es un array de botones.
 *   Cada botón: { text, url, style? }
 *   style: 'primary' (azul) | 'success' (verde) | 'danger' (rojo)
 * @returns {Object} reply_markup listo para enviar
 */
function buildUrlKeyboard(rows) {
  if (!rows || !rows.length) return null;

  // Aplanamos para usar el builder (él maneja la estructura)
  const builder = new InlineKeyboardBuilder(
    rows.map((row) => row.length)
  );

  for (const row of rows) {
    for (const btn of row) {
      builder.addUrlButton(btn.text, btn.url, {
        style: btn.style || undefined,
      });
    }
  }

  return builder.build();
}

/**
 * Parsea el JSON guardado en la BD y devuelve el teclado.
 */
function parseButtonsJson(json) {
  if (!json) return null;
  try {
    const rows = JSON.parse(json);
    return buildUrlKeyboard(rows);
  } catch (err) {
    console.error('Error parseando buttons_json:', err.message);
    return null;
  }
}

module.exports = { buildUrlKeyboard, parseButtonsJson };