const crypto = require('node:crypto');

/**
 * Token de API por sistema, pra automacao (script/agente do proprio dono)
 * disparar update/restart sem precisar de sessao de usuario. So o hash fica
 * no banco (igual senha) - o valor em texto puro so existe no momento em que
 * e gerado, nunca mais pode ser recuperado (so gerar um novo, que invalida o
 * anterior).
 */
function hashApiToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function generateApiToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashApiToken(token) };
}

function verifyApiToken(token, hash) {
  if (!token || !hash) return false;
  const candidate = Buffer.from(hashApiToken(token), 'hex');
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { generateApiToken, verifyApiToken };
