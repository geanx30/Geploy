const express = require('express');
const db = require('../db');
const { requireAuth, requireAdmin, requirePasswordChanged, hashPassword } = require('../auth');
const { encrypt } = require('../crypto');
const { applySystemUpdate } = require('../services/applyUpdate');
const { logAction } = require('../audit');
const mailer = require('../services/mailer');

const router = express.Router();
router.use(requireAuth, requirePasswordChanged, requireAdmin);

// ---------- Usuarios ----------

router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY username').all();
  res.json(rows);
});

router.post('/users', (req, res) => {
  const { username, password, role, email } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario e senha sao obrigatorios' });
  }
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role invalida' });
  }
  try {
    const info = db
      .prepare('INSERT INTO users (username, password_hash, role, email, must_change_password) VALUES (?, ?, ?, ?, 1)')
      .run(username, hashPassword(password), role, email || null);
    res.status(201).json({ id: info.lastInsertRowid, username, role, email: email || null });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Usuario ja existe' });
    }
    res.status(500).json({ error: 'Erro ao criar usuario' });
  }
});

router.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const { password, role, email } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

  if (role && !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role invalida' });
  }
  if (role === 'user' && user.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get();
    if (admins.c <= 1) {
      return res.status(400).json({ error: 'Deve existir ao menos um administrador' });
    }
  }

  db.prepare(
    `UPDATE users SET password_hash = COALESCE(?, password_hash), role = COALESCE(?, role),
       email = COALESCE(?, email),
       must_change_password = CASE WHEN ? THEN 1 ELSE must_change_password END
     WHERE id = ?`
  ).run(password ? hashPassword(password) : null, role || null, email !== undefined ? email || null : null, password ? 1 : 0, id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
  if (user.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get();
    if (admins.c <= 1) {
      return res.status(400).json({ error: 'Deve existir ao menos um administrador' });
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- Sistemas ----------

function upsertSystemPayload(body) {
  const {
    name,
    owner_user_id,
    repo_path,
    process_type,
    service_name,
    site_name,
    app_pool_name,
    git_auth_type,
    git_username,
    git_token,
    git_ssh_key_path,
    post_update_commands,
    access_url,
    public_url,
  } = body;

  return {
    name,
    owner_user_id,
    repo_path,
    process_type,
    service_name: service_name || null,
    site_name: site_name || null,
    app_pool_name: app_pool_name || null,
    git_auth_type: git_auth_type || 'none',
    git_username: git_username || null,
    git_token_encrypted: git_token ? encrypt(git_token) : null,
    git_ssh_key_path: git_ssh_key_path || null,
    post_update_commands: post_update_commands || null,
    access_url: access_url || null,
    public_url: public_url || null,
  };
}

router.get('/systems', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, u.username AS owner_username FROM systems s
       JOIN users u ON u.id = s.owner_user_id ORDER BY s.name`
    )
    .all();
  res.json(rows.map(({ git_token_encrypted, ...rest }) => rest));
});

router.post('/systems', (req, res) => {
  const p = upsertSystemPayload(req.body || {});
  if (!p.name || !p.owner_user_id || !p.repo_path || !p.process_type) {
    return res.status(400).json({ error: 'Campos obrigatorios faltando' });
  }
  if (!['windows_service', 'iis_site'].includes(p.process_type)) {
    return res.status(400).json({ error: 'process_type invalido' });
  }

  const info = db
    .prepare(
      `INSERT INTO systems
        (name, owner_user_id, repo_path, process_type, service_name, site_name, app_pool_name,
         git_auth_type, git_username, git_token_encrypted, git_ssh_key_path, post_update_commands, access_url, public_url)
       VALUES (@name, @owner_user_id, @repo_path, @process_type, @service_name, @site_name, @app_pool_name,
         @git_auth_type, @git_username, @git_token_encrypted, @git_ssh_key_path, @post_update_commands, @access_url, @public_url)`
    )
    .run(p);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/systems/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM systems WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Sistema nao encontrado' });

  const merged = upsertSystemPayload({ ...existing, git_token: undefined, ...req.body });
  // Preserva token/credencial existente se nenhum novo valor foi enviado
  if (!req.body.git_token) merged.git_token_encrypted = existing.git_token_encrypted;
  if (req.body.git_ssh_key_path === undefined) merged.git_ssh_key_path = existing.git_ssh_key_path;

  db.prepare(
    `UPDATE systems SET name=@name, owner_user_id=@owner_user_id, repo_path=@repo_path,
       process_type=@process_type, service_name=@service_name, site_name=@site_name,
       app_pool_name=@app_pool_name, git_auth_type=@git_auth_type, git_username=@git_username,
       git_token_encrypted=@git_token_encrypted, git_ssh_key_path=@git_ssh_key_path,
       post_update_commands=@post_update_commands, access_url=@access_url, public_url=@public_url
     WHERE id=@id`
  ).run({ ...merged, id });
  res.json({ ok: true });
});

router.delete('/systems/:id', (req, res) => {
  db.prepare('DELETE FROM systems WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Auditoria geral ----------

router.get('/audit', (req, res) => {
  const rows = db
    .prepare(
      `SELECT al.id, al.action, al.success, al.output, al.created_at, u.username, s.name AS system_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN systems s ON s.id = al.system_id
       ORDER BY al.id DESC LIMIT 300`
    )
    .all();
  res.json(rows);
});

// ---------- Solicitacoes de atualizacao (aprovacao) ----------

function toPublicUpdateRequest(row) {
  const { findings_json, ...rest } = row;
  return { ...rest, findings: JSON.parse(findings_json || '[]') };
}

router.get('/update-requests', (req, res) => {
  const rows = db
    .prepare(
      `SELECT ur.*, s.name AS system_name, ru.username AS requested_by, du.username AS decided_by
       FROM update_requests ur
       JOIN systems s ON s.id = ur.system_id
       LEFT JOIN users ru ON ru.id = ur.requested_by_user_id
       LEFT JOIN users du ON du.id = ur.decided_by_user_id
       ORDER BY ur.id DESC LIMIT 200`
    )
    .all();
  res.json(rows.map(toPublicUpdateRequest));
});

router.post('/update-requests/:id/approve', async (req, res) => {
  const reqRow = db.prepare('SELECT * FROM update_requests WHERE id = ?').get(Number(req.params.id));
  if (!reqRow) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Solicitacao ja foi decidida' });

  const system = db.prepare('SELECT * FROM systems WHERE id = ?').get(reqRow.system_id);
  if (!system) return res.status(404).json({ error: 'Sistema nao encontrado' });

  const result = await applySystemUpdate(system, reqRow.post_update_commands);

  db.prepare(
    `UPDATE update_requests SET status='approved', decided_by_user_id=?, decided_at=datetime('now'), result_output=? WHERE id=?`
  ).run(req.user.sub, result.output, reqRow.id);

  logAction({
    userId: req.user.sub,
    systemId: system.id,
    action: 'update-approved',
    success: result.success,
    output: `Solicitacao #${reqRow.id} aprovada.\n\n${result.output}`,
  });

  res.json(result);
});

router.post('/update-requests/:id/reject', (req, res) => {
  const reqRow = db.prepare('SELECT * FROM update_requests WHERE id = ?').get(Number(req.params.id));
  if (!reqRow) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Solicitacao ja foi decidida' });

  db.prepare(
    `UPDATE update_requests SET status='rejected', decided_by_user_id=?, decided_at=datetime('now') WHERE id=?`
  ).run(req.user.sub, reqRow.id);

  logAction({
    userId: req.user.sub,
    systemId: reqRow.system_id,
    action: 'update-rejected',
    success: false,
    output: `Solicitacao #${reqRow.id} rejeitada pelo admin.`,
  });

  res.json({ ok: true });
});

// ---------- SMTP ----------

router.get('/smtp', (req, res) => {
  res.json(mailer.getPublicSettings() || {});
});

router.put('/smtp', (req, res) => {
  const { host, port, secure, username, password, from_address, enabled } = req.body || {};
  if (enabled && (!host || !port || !from_address)) {
    return res.status(400).json({ error: 'Host, porta e remetente são obrigatórios para habilitar o envio' });
  }
  const settings = mailer.saveSettings({ host, port, secure, username, password, from_address, enabled });
  res.json(settings);
});

router.post('/smtp/test', async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ error: 'Informe um destinatário para o teste' });
  try {
    await mailer.sendTestMail(to);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
