/**
 * Normaliza y valida un identificador de canal.
 * Devuelve { chatId, isPublic } o lanza Error.
 */
function parseChannelInput(input) {
  const clean = String(input || '').trim();
  if (!clean) throw new Error('Debes indicar un canal o grupo.');

  // Caso 1: @username
  if (clean.startsWith('@')) {
    const username = clean.slice(1);
    if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) {
      throw new Error('El @username no es válido.');
    }
    return { chatId: `@${username}`, isPublic: true };
  }

  // Caso 2: ID numérico (-100... o -...)
  if (/^-?\d+$/.test(clean)) {
    return { chatId: clean, isPublic: false };
  }

  throw new Error('Formato no válido. Usa @username o el ID numérico.');
}

module.exports = { parseChannelInput };