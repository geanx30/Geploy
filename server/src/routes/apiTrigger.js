const express = require('express');
const db = require('../db');
const { requireSystemApiToken } = require('../middleware/loadSystem');
const { previewUpdate } = require('../services/diffPreview');
const { applySystemUpdate } = require('../services/applyUpdate');
const { performAction } = require('../services/processControl');
const { logAction } = require('../audit');
const { sendRiskAlert } = require('../services/alerts');

// Rotas autenticadas por token de API (Authorization: Bearer <token>), uma
// por sistema - pensadas pra um script/agente do proprio dono disparar
// update/restart sem precisar logar na tela. Espelham exatamente o que os
// botoes "Atualizar"/"Reiniciar" fazem para um usuario comum: NUNCA trata
// como admin, entao uma atualizacao com achado de risco sempre vira
// solicitacao pendente (mesmo que o dono da conta seja administrador) -
// automacao desatendida nao deve poder pular a aprovacao.
const router = express.Router();

function needsGitToken(system) {
  return system.git_auth_type === 'https_token' && !system.git_token_encrypted;
}

router.get('/:id/status', requireSystemApiToken, async (req, res) => {
  const result = await performAction(req.system, 'status');
  res.json(result);
});

router.post('/:id/update', requireSystemApiToken, async (req, res) => {
  const system = req.system;

  if (needsGitToken(system)) {
    const result = {
      success: false,
      output: 'Este sistema precisa de um token de acesso ao repositório. Configure antes de atualizar.',
    };
    logAction({
      userId: null,
      systemId: system.id,
      action: 'update',
      success: false,
      output: `${result.output} (via token de API)`,
    });
    return res.json(result);
  }

  const commandsForThisRun =
    typeof req.body?.post_update_commands === 'string' ? req.body.post_update_commands : system.post_update_commands;

  const preview = await previewUpdate(system);
  if (!preview.success) {
    const result = { success: false, output: preview.error };
    logAction({
      userId: null,
      systemId: system.id,
      action: 'update',
      success: false,
      output: `${result.output} (via token de API)`,
    });
    return res.json(result);
  }

  if (preview.hasChanges && preview.findings.length > 0) {
    const info = db
      .prepare(
        `INSERT INTO update_requests
          (system_id, requested_by_user_id, diff_stat, diff_text, findings_json, post_update_commands)
         VALUES (?, NULL, ?, ?, ?, ?)`
      )
      .run(system.id, preview.diffStat, preview.diffText, JSON.stringify(preview.findings), commandsForThisRun || null);

    logAction({
      userId: null,
      systemId: system.id,
      action: 'update-requested',
      success: true,
      output: `${preview.findings.length} ponto(s) de risco encontrados via token de API — aguardando aprovação de um admin (solicitação #${info.lastInsertRowid}).`,
    });

    sendRiskAlert({
      system,
      requestedByUsername: 'token de API',
      findings: preview.findings,
      requestId: info.lastInsertRowid,
    }).catch((err) => console.error('Falha ao enviar alerta de risco:', err.message));

    return res.json({
      pending: true,
      requestId: info.lastInsertRowid,
      findings: preview.findings,
      diffStat: preview.diffStat,
    });
  }

  const result = await applySystemUpdate(system, commandsForThisRun);
  logAction({
    userId: null,
    systemId: system.id,
    action: 'update',
    success: result.success,
    output: `${result.output}\n\n(via token de API)`,
  });
  res.json(result);
});

router.post('/:id/restart', requireSystemApiToken, async (req, res) => {
  const result = await performAction(req.system, 'restart');
  logAction({
    userId: null,
    systemId: req.system.id,
    action: 'restart',
    success: result.success,
    output: `${result.output}\n\n(via token de API)`,
  });
  res.json(result);
});

module.exports = router;
