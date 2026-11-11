const db = require('../db');
const { verifyApiToken } = require('../services/apiToken');

/**
 * Carrega o sistema pelo :id da URL e garante que o usuario autenticado
 * e dono dele (ou admin). O path/nome de servico usados nas acoes SEMPRE
 * vem do registro carregado aqui, nunca do corpo da requisicao.
 */
function loadSystemAndCheckOwnership(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Id de sistema invalido' });
  }

  const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
  if (!system) {
    return res.status(404).json({ error: 'Sistema nao encontrado' });
  }

  if (req.user.role !== 'admin' && system.owner_user_id !== req.user.sub) {
    return res.status(403).json({ error: 'Voce nao tem permissao sobre este sistema' });
  }

  req.system = system;
  next();
}

/**
 * Autentica por token de API (header "Authorization: Bearer <token>") em vez
 * de sessao de usuario - pensado pra automacao externa (ex.: um script ou
 * agente do proprio dono) disparar update/restart sem precisar logar.
 * O token e especifico de UM sistema (gerado pelo dono/admin daquele
 * sistema), nunca um token geral que valeria pra qualquer sistema.
 */
function requireSystemApiToken(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Id de sistema invalido' });
  }

  const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
  if (!system) {
    return res.status(404).json({ error: 'Sistema nao encontrado' });
  }

  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : null;

  if (!system.api_token_hash || !verifyApiToken(token, system.api_token_hash)) {
    return res.status(401).json({ error: 'Token de API invalido ou ausente' });
  }

  req.system = system;
  next();
}

module.exports = { loadSystemAndCheckOwnership, requireSystemApiToken };
