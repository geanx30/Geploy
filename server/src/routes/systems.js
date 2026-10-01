const express = require('express');
const db = require('../db');
const { requireAuth, requirePasswordChanged } = require('../auth');
const { loadSystemAndCheckOwnership } = require('../middleware/loadSystem');
const { previewUpdate } = require('../services/diffPreview');
const { applySystemUpdate } = require('../services/applyUpdate');
const { performAction } = require('../services/processControl');
const { logAction } = require('../audit');
const { sendRiskAlert } = require('../services/alerts');

const router = express.Router();
router.use(requireAuth, requirePasswordChanged);

function toPublicSystem(system) {
  const { git_token_encrypted, git_ssh_key_path, ...rest } = system;
  return { ...rest, has_git_credentials: Boolean(git_token_encrypted || git_ssh_key_path) };
}

router.get('/', (req, res) => {
  const rows =
    req.user.role === 'admin'
      ? db
          .prepare(
            `SELECT s.*, u.username AS owner_username FROM systems s
             JOIN users u ON u.id = s.owner_user_id ORDER BY s.name`
          )
          .all()
      : db.prepare('SELECT * FROM systems WHERE owner_user_id = ? ORDER BY name').all(req.user.sub);
  res.json(rows.map(toPublicSystem));
});

router.get('/:id/status', loadSystemAndCheckOwnership, async (req, res) => {
  const result = await performAction(req.system, 'status');
  res.json(result);
});

router.get('/:id/update-requests', loadSystemAndCheckOwnership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, status, diff_stat, findings_json, created_at, decided_at
       FROM update_requests WHERE system_id = ? ORDER BY id DESC LIMIT 20`
    )
    .all(req.system.id);
  res.json(rows.map(({ findings_json, ...rest }) => ({ ...rest, findings: JSON.parse(findings_json || '[]') })));
});

router.get('/:id/audit', loadSystemAndCheckOwnership, (req, res) => {
  const rows = db
    .prepare(
      `SELECT al.id, al.action, al.success, al.output, al.created_at, u.username
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
       WHERE al.system_id = ? ORDER BY al.id DESC LIMIT 100`
    )
    .all(req.system.id);
  res.json(rows);
});

router.post('/:id/preview-update', loadSystemAndCheckOwnership, async (req, res) => {
  const preview = await previewUpdate(req.system);
  res.json(preview);
});

router.post('/:id/update', loadSystemAndCheckOwnership, async (req, res) => {
  const isAdmin = req.user.role === 'admin';

  // Comandos podem ser ajustados pelo dono so para esta execucao (nao sao
  // persistidos aqui); se nao vierem no corpo, usa o que o admin configurou.
  const commandsForThisRun =
    typeof req.body?.post_update_commands === 'string'
      ? req.body.post_update_commands
      : req.system.post_update_commands;

  // A decisao de bloquear ou nao SEMPRE e recalculada aqui no servidor
  // (nunca confia no que o cliente diz que a pre-visualizacao mostrou).
  const preview = await previewUpdate(req.system);
  if (!preview.success) {
    const result = { success: false, output: preview.error };
    logAction({ userId: req.user.sub, systemId: req.system.id, action: 'update', success: false, output: result.output });
    return res.json(result);
  }

  if (preview.hasChanges && preview.findings.length > 0 && !isAdmin) {
    const info = db
      .prepare(
        `INSERT INTO update_requests
          (system_id, requested_by_user_id, diff_stat, diff_text, findings_json, post_update_commands)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.system.id,
        req.user.sub,
        preview.diffStat,
        preview.diffText,
        JSON.stringify(preview.findings),
        commandsForThisRun || null
      );

    logAction({
      userId: req.user.sub,
      systemId: req.system.id,
      action: 'update-requested',
      success: true,
      output: `${preview.findings.length} ponto(s) de risco encontrados — aguardando aprovacao de um admin (solicitacao #${info.lastInsertRowid}).`,
    });

    sendRiskAlert({
      system: req.system,
      requestedByUsername: req.user.username,
      findings: preview.findings,
      requestId: info.lastInsertRowid,
    }).catch((err) => console.error('Falha ao enviar alerta de risco:', err.message));

    return res.json({ pending: true, requestId: info.lastInsertRowid, findings: preview.findings, diffStat: preview.diffStat });
  }

  const result = await applySystemUpdate(req.system, commandsForThisRun);
  logAction({
    userId: req.user.sub,
    systemId: req.system.id,
    action: 'update',
    success: result.success,
    output: result.output,
  });
  res.json(result);
});

for (const action of ['start', 'stop', 'restart']) {
  router.post(`/:id/${action}`, loadSystemAndCheckOwnership, async (req, res) => {
    const result = await performAction(req.system, action);
    logAction({
      userId: req.user.sub,
      systemId: req.system.id,
      action,
      success: result.success,
      output: result.output,
    });
    res.json(result);
  });
}

module.exports = router;
