const nodemailer = require('nodemailer');
const db = require('../db');
const { encrypt, decrypt } = require('../crypto');

function getSettings() {
  return db.prepare('SELECT * FROM smtp_settings WHERE id = 1').get() || null;
}

function getPublicSettings() {
  const s = getSettings();
  if (!s) return null;
  const { password_encrypted, ...rest } = s;
  return { ...rest, has_password: Boolean(password_encrypted) };
}

function saveSettings({ host, port, secure, username, password, from_address, enabled }) {
  const existing = getSettings();
  const payload = {
    host: host || null,
    port: port ? Number(port) : null,
    secure: secure ? 1 : 0,
    username: username || null,
    password_encrypted: password ? encrypt(password) : existing?.password_encrypted || null,
    from_address: from_address || null,
    enabled: enabled ? 1 : 0,
  };

  db.prepare(
    `INSERT INTO smtp_settings (id, host, port, secure, username, password_encrypted, from_address, enabled, updated_at)
     VALUES (1, @host, @port, @secure, @username, @password_encrypted, @from_address, @enabled, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       host=excluded.host, port=excluded.port, secure=excluded.secure, username=excluded.username,
       password_encrypted=excluded.password_encrypted, from_address=excluded.from_address,
       enabled=excluded.enabled, updated_at=excluded.updated_at`
  ).run(payload);

  return getPublicSettings();
}

function buildTransport(settings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: Boolean(settings.secure),
    auth: settings.username ? { user: settings.username, pass: decrypt(settings.password_encrypted) } : undefined,
  });
}

/**
 * Envia um e-mail se o SMTP estiver configurado e habilitado. Falhas sao
 * logadas no console mas nunca interrompem o fluxo que disparou o alerta.
 */
async function sendMail({ to, subject, text, html }) {
  const settings = getSettings();
  if (!settings || !settings.enabled || !settings.host || !to || (Array.isArray(to) && to.length === 0)) {
    return { sent: false, reason: 'SMTP nao configurado/habilitado, ou sem destinatarios' };
  }

  try {
    const transport = buildTransport(settings);
    await transport.sendMail({
      from: settings.from_address || settings.username,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error('Falha ao enviar e-mail:', err.message);
    return { sent: false, reason: err.message };
  }
}

async function sendTestMail(to) {
  const settings = getSettings();
  if (!settings || !settings.host) {
    throw new Error('Configure o SMTP antes de testar.');
  }
  const transport = buildTransport(settings);
  await transport.sendMail({
    from: settings.from_address || settings.username,
    to,
    subject: 'Geploy — e-mail de teste',
    text: 'Se voce recebeu este e-mail, a configuracao de SMTP do Geploy esta funcionando corretamente.',
  });
}

module.exports = { getSettings, getPublicSettings, saveSettings, sendMail, sendTestMail };
