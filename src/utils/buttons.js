// src/utils/buttons.js

/**
 * Convierte el JSON de botones en un reply_markup válido para Telegraf.
 * Formato JSON esperado:
 *   [ [{ text, url, style? }, ...], ... ]  // filas de botones
 */
function parseButtonsJson(json) {
  if (!json) return null;

  // Si ya es un objeto (por si acaso), devolverlo tal cual
  if (typeof json === 'object') return json;

  try {
    const rows = JSON.parse(json);
    if (!Array.isArray(rows)) return null;

    return {
      inline_keyboard: rows.map((row) =>
        row.map((btn) => {
          const out = {
            text: btn.text,
            url: btn.url,
          };
          if (
            btn.style &&
            ['primary', 'success', 'danger'].includes(btn.style)
          ) {
            out.style = btn.style;
          }
          return out;
        })
      ),
    };
  } catch (err) {
    console.error('Error parseando buttons_json:', err.message);
    return null;
  }
}

module.exports = { parseButtonsJson };