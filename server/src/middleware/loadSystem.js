const db = require('../db');

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

module.exports = { loadSystemAndCheckOwnership };
