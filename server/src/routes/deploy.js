const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const { requireAuth, requireAdmin, requirePasswordChanged } = require('../auth');
const { encrypt, decrypt } = require('../crypto');
const { logAction } = require('../audit');
const { scanTree } = require('../services/riskScan');
const { cloneRepo, removeDir, findEnvTemplates, writeEnvFiles, suggestPorts } = require('../services/deployWizard');
const { createWindowsService } = require('../services/serviceProvision');
const { runPostUpdateCommands } = require('../services/postUpdate');
const { sendDeployRequestAlert } = require('../services/alerts');

const router = express.Router();
router.use(requireAuth, requirePasswordChanged, requireAdmin);

const STAGING_ROOT = path.resolve(__dirname, '..', '..', '..', 'data', 'deploy-staging');
const SISTEMAS_ROOT = process.env.SYSTEMS_ROOT || 'C:\\Sistemas';

function safeFolderName(name) {
  return String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9 _.-]/g, '')
    .slice(0, 80);
}

function usedPortsFromSystems() {
  const rows = db.prepare('SELECT access_url, public_url FROM systems').all();
  const ports = [];
  for (const row of rows) {
    for (const value of [row.access_url, row.public_url]) {
      const match = value && value.match(/:(\d+)\b/);
      if (match) ports.push(Number(match[1]));
    }
  }
  return ports;
}

function toPublicRequest(row) {
  const { git_token_encrypted, env_files_encrypted, ...rest } = row;
  return { ...rest, findings: JSON.parse(row.findings_json || '[]') };
}

router.get('/suggested-ports', (req, res) => {
  res.json(suggestPorts(usedPortsFromSystems()));
});

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT dr.*, ru.username AS requested_by, du.username AS decided_by, ou.username AS owner_username
       FROM deploy_requests dr
       LEFT JOIN users ru ON ru.id = dr.requested_by_user_id
       LEFT JOIN users du ON du.id = dr.decided_by_user_id
       LEFT JOIN users ou ON ou.id = dr.owner_user_id
       ORDER BY dr.id DESC LIMIT 100`
    )
    .all();
  res.json(rows.map(toPublicRequest));
});

// Clona o repositorio para uma pasta de rascunho e ja devolve o que foi
// encontrado (riscos + .env.example + portas livres), sem criar nada definitivo.
router.post('/preview', async (req, res) => {
  const { name, repo_url, git_auth_type, git_username, git_token, git_ssh_key_path } = req.body || {};
  if (!name || !repo_url) {
    return res.status(400).json({ error: 'Nome e URL do repositório são obrigatórios.' });
  }

  const folderName = safeFolderName(name);
  if (!folderName) return res.status(400).json({ error: 'Nome inválido.' });

  const stagingPath = path.join(STAGING_ROOT, `${Date.now()}-${folderName}`);
  const cloneResult = await cloneRepo({
    repoUrl: repo_url,
    gitAuthType: git_auth_type,
    gitUsername: git_username,
    gitToken: git_token,
    gitSshKeyPath: git_ssh_key_path,
    targetDir: stagingPath,
  });

  if (!cloneResult.success) {
    return res.json({ success: false, output: cloneResult.output });
  }

  const findings = scanTree(stagingPath);
  const envTemplates = findEnvTemplates(stagingPath);
  const ports = suggestPorts(usedPortsFromSystems());

  res.json({
    success: true,
    stagingPath,
    finalPath: path.join(SISTEMAS_ROOT, folderName),
    findings,
    envTemplates,
    suggestedPorts: ports.suggestions,
    usedPorts: ports.used,
  });
});

// Cria a solicitacao pendente com tudo que o admin configurou. Nao mexe em
// nada definitivo ainda — so depois de aprovada (por um admin, igual as
// atualizacoes arriscadas) o Geploy move a pasta e cria o servico de verdade.
router.post('/', (req, res) => {
  const {
    name,
    owner_user_id,
    staging_path,
    repo_url,
    git_auth_type,
    git_username,
    git_token,
    git_ssh_key_path,
    process_type,
    service_name,
    site_name,
    app_pool_name,
    start_command,
    post_update_commands,
    access_url,
    public_url,
    env_files,
  } = req.body || {};

  if (!name || !owner_user_id || !staging_path || !repo_url || !process_type) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }
  if (!path.resolve(staging_path).startsWith(path.resolve(STAGING_ROOT) + path.sep)) {
    return res.status(400).json({ error: 'Pasta de rascunho inválida.' });
  }
  if (!fs.existsSync(staging_path)) {
    return res.status(400).json({ error: 'Essa pré-visualização expirou ou já foi usada. Refaça o clone.' });
  }
  if (process_type === 'windows_service' && !start_command) {
    return res.status(400).json({ error: 'Informe o comando que inicia o sistema.' });
  }

  const findings = scanTree(staging_path);
  const envFilesEncrypted = env_files ? encrypt(JSON.stringify(env_files)) : null;

  const info = db
    .prepare(
      `INSERT INTO deploy_requests
        (requested_by_user_id, name, owner_user_id, staging_path, final_path, repo_url,
         git_auth_type, git_username, git_token_encrypted, git_ssh_key_path,
         process_type, service_name, site_name, app_pool_name, start_command, post_update_commands,
         access_url, public_url, env_files_encrypted, findings_json)
       VALUES (@requested_by_user_id, @name, @owner_user_id, @staging_path, @final_path, @repo_url,
         @git_auth_type, @git_username, @git_token_encrypted, @git_ssh_key_path,
         @process_type, @service_name, @site_name, @app_pool_name, @start_command, @post_update_commands,
         @access_url, @public_url, @env_files_encrypted, @findings_json)`
    )
    .run({
      requested_by_user_id: req.user.sub,
      name,
      owner_user_id: Number(owner_user_id),
      staging_path,
      final_path: path.join(SISTEMAS_ROOT, safeFolderName(name)),
      repo_url,
      git_auth_type: git_auth_type || 'none',
      git_username: git_username || null,
      git_token_encrypted: git_token ? encrypt(git_token) : null,
      git_ssh_key_path: git_ssh_key_path || null,
      process_type,
      service_name: service_name || null,
      site_name: site_name || null,
      app_pool_name: app_pool_name || null,
      start_command: start_command || null,
      post_update_commands: post_update_commands || null,
      access_url: access_url || null,
      public_url: public_url || null,
      env_files_encrypted: envFilesEncrypted,
      findings_json: JSON.stringify(findings),
    });

  logAction({
    userId: req.user.sub,
    systemId: null,
    action: 'deploy-requested',
    success: true,
    output: `Novo sistema "${name}" solicitado — aguardando aprovação (solicitação #${info.lastInsertRowid}).${
      findings.length ? ` ${findings.length} ponto(s) suspeito(s) encontrados.` : ''
    }`,
  });

  sendDeployRequestAlert({
    name,
    requestedByUsername: req.user.username,
    findings,
    requestId: info.lastInsertRowid,
  }).catch((err) => console.error('Falha ao enviar alerta de deploy:', err.message));

  res.status(201).json({ id: info.lastInsertRowid });
});

router.post('/:id/approve', async (req, res) => {
  const reqRow = db.prepare('SELECT * FROM deploy_requests WHERE id = ?').get(Number(req.params.id));
  if (!reqRow) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Solicitação já foi decidida.' });

  const steps = [];
  try {
    if (!fs.existsSync(reqRow.final_path)) {
      fs.mkdirSync(path.dirname(reqRow.final_path), { recursive: true });
      fs.renameSync(reqRow.staging_path, reqRow.final_path);
      steps.push(`Pasta movida para ${reqRow.final_path}`);
    }

    if (reqRow.env_files_encrypted) {
      writeEnvFiles(reqRow.final_path, JSON.parse(decrypt(reqRow.env_files_encrypted)));
      steps.push('Arquivos .env gravados.');
    }

    if (reqRow.post_update_commands) {
      const setupResult = await runPostUpdateCommands({
        repo_path: reqRow.final_path,
        post_update_commands: reqRow.post_update_commands,
      });
      steps.push(`Comandos de instalação:\n${setupResult.output}`);
      if (!setupResult.success) {
        throw new Error('Falha ao rodar os comandos de instalação. Veja o detalhe acima.');
      }
    }

    let serviceResult = { success: true, output: '' };
    if (reqRow.process_type === 'windows_service') {
      const logsDir = path.join(reqRow.final_path, 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      const portMatch = (reqRow.access_url || '').match(/:(\d+)\b/);
      serviceResult = await createWindowsService({
        serviceName: reqRow.service_name,
        command: reqRow.start_command,
        appDirectory: reqRow.final_path,
        stdoutLog: path.join(logsDir, 'service-out.log'),
        stderrLog: path.join(logsDir, 'service-err.log'),
        env: portMatch ? { PORT: portMatch[1] } : undefined,
      });
      if (portMatch) {
        steps.push(`Variável de ambiente PORT=${portMatch[1]} definida para o serviço (a partir do endereço interno).`);
      }
      steps.push(serviceResult.output);
      if (!serviceResult.success) {
        throw new Error('Falha ao criar/iniciar o serviço Windows. Veja o detalhe acima, ajuste o que for preciso e aprove de novo.');
      }
    } else {
      steps.push('Site IIS não é criado automaticamente — configure o site/app pool manualmente e depois edite o sistema cadastrado abaixo se precisar ajustar o nome.');
    }

    const systemInfo = db
      .prepare(
        `INSERT INTO systems
          (name, owner_user_id, repo_path, process_type, service_name, site_name, app_pool_name,
           git_auth_type, git_username, git_token_encrypted, git_ssh_key_path, post_update_commands,
           access_url, public_url)
         VALUES (@name, @owner_user_id, @repo_path, @process_type, @service_name, @site_name, @app_pool_name,
           @git_auth_type, @git_username, @git_token_encrypted, @git_ssh_key_path, @post_update_commands,
           @access_url, @public_url)`
      )
      .run({
        name: reqRow.name,
        owner_user_id: reqRow.owner_user_id,
        repo_path: reqRow.final_path,
        process_type: reqRow.process_type,
        service_name: reqRow.service_name,
        site_name: reqRow.site_name,
        app_pool_name: reqRow.app_pool_name,
        git_auth_type: reqRow.git_auth_type,
        git_username: reqRow.git_username,
        git_token_encrypted: reqRow.git_token_encrypted,
        git_ssh_key_path: reqRow.git_ssh_key_path,
        post_update_commands: reqRow.post_update_commands,
        access_url: reqRow.access_url,
        public_url: reqRow.public_url,
      });

    const resultOutput = steps.join('\n\n');
    db.prepare(
      `UPDATE deploy_requests SET status='approved', decided_by_user_id=?, decided_at=datetime('now'),
         result_output=?, system_id=? WHERE id=?`
    ).run(req.user.sub, resultOutput, systemInfo.lastInsertRowid, reqRow.id);

    logAction({
      userId: req.user.sub,
      systemId: systemInfo.lastInsertRowid,
      action: 'deploy-approved',
      success: serviceResult.success,
      output: `Solicitação #${reqRow.id} aprovada.\n\n${resultOutput}`,
    });

    res.json({ success: serviceResult.success, output: resultOutput, systemId: systemInfo.lastInsertRowid });
  } catch (err) {
    const output = `${steps.join('\n\n')}\n\nErro: ${err.message}`;
    db.prepare('UPDATE deploy_requests SET result_output=? WHERE id=?').run(output, reqRow.id);
    logAction({ userId: req.user.sub, systemId: null, action: 'deploy-approved', success: false, output });
    res.status(500).json({ error: err.message, output });
  }
});

router.post('/:id/reject', (req, res) => {
  const reqRow = db.prepare('SELECT * FROM deploy_requests WHERE id = ?').get(Number(req.params.id));
  if (!reqRow) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Solicitação já foi decidida.' });

  removeDir(reqRow.staging_path);

  db.prepare(
    `UPDATE deploy_requests SET status='rejected', decided_by_user_id=?, decided_at=datetime('now') WHERE id=?`
  ).run(req.user.sub, reqRow.id);

  logAction({
    userId: req.user.sub,
    systemId: null,
    action: 'deploy-rejected',
    success: false,
    output: `Solicitação #${reqRow.id} ("${reqRow.name}") rejeitada; pasta de rascunho removida.`,
  });

  res.json({ ok: true });
});

module.exports = router;
