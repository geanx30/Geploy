const db = require('../db');
const { sendMail } = require('./mailer');
const { renderAlertEmail } = require('./emailTemplates');

const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://vm-sistemas:5173';

function adminEmails() {
  return db
    .prepare("SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL AND email != ''")
    .all()
    .map((r) => r.email);
}

function ownerEmail(ownerUserId) {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(ownerUserId);
  return row?.email || null;
}

/**
 * Dispara quando a analise de atualizacao encontra risco e a atualizacao
 * fica pendente de aprovacao (fluxo de usuario comum). Vai para todos os admins.
 */
async function sendRiskAlert({ system, requestedByUsername, findings, requestId }) {
  const to = adminEmails();
  if (to.length === 0) return;

  const findingsList = findings
    .map((f) => `- ${f.label}${f.file ? ` (${f.file}:${f.line})` : ''}`)
    .join('\n');

  const html = renderAlertEmail({
    tone: 'warning',
    badge: 'Atualização suspeita',
    title: `"${system.name}" tem uma atualização aguardando aprovação`,
    intro: `O usuário ${requestedByUsername} tentou atualizar o sistema "${system.name}" e a análise encontrou ${findings.length} ponto(s) suspeito(s) no que seria trazido do repositório:`,
    items: findings.map((f) => ({ label: f.label, meta: f.file ? `${f.file}:${f.line}` : null })),
    ctaLabel: `Revisar solicitação #${requestId}`,
    ctaUrl: `${BASE_URL}/admin/approvals`,
  });

  await sendMail({
    to,
    subject: `Geploy: atualização suspeita em "${system.name}" aguardando aprovação`,
    text: `O usuário ${requestedByUsername} tentou atualizar o sistema "${system.name}" e a análise encontrou ${findings.length} ponto(s) suspeito(s):\n\n${findingsList}\n\nRevise e aprove ou rejeite em: ${BASE_URL}/admin/approvals (solicitação #${requestId})`,
    html,
  });
}

/**
 * Dispara quando um sistema fica fora do ar por tempo igual ou maior que o
 * limite configurado. Vai para todos os admins + o dono do sistema.
 */
async function sendDownAlert(system) {
  const to = [...adminEmails()];
  const owner = ownerEmail(system.owner_user_id);
  if (owner) to.push(owner);

  const unique = [...new Set(to)];
  if (unique.length === 0) return;

  const html = renderAlertEmail({
    tone: 'danger',
    badge: 'Sistema fora do ar',
    title: `"${system.name}" está fora do ar`,
    intro: `O sistema "${system.name}" está fora do ar há 3 minutos ou mais. Verifique e reinicie se necessário.`,
    ctaLabel: 'Abrir o Geploy',
    ctaUrl: BASE_URL,
  });

  await sendMail({
    to: unique,
    subject: `Geploy: sistema "${system.name}" está fora do ar`,
    text: `O sistema "${system.name}" está fora do ar há 3 minutos ou mais.\n\nVerifique e reinicie se necessário em: ${BASE_URL}`,
    html,
  });
}

/**
 * Dispara sempre que um novo pedido de deploy (sistema novo) e criado —
 * mesmo quando quem pediu e um admin, toda solicitacao fica pendente de
 * aprovacao de algum admin. Vai para todos os admins.
 */
async function sendDeployRequestAlert({ name, requestedByUsername, findings, requestId }) {
  const to = adminEmails();
  if (to.length === 0) return;

  const hasRisk = findings.length > 0;
  const findingsList = findings.map((f) => `- ${f.label}${f.file ? ` (${f.file}:${f.line})` : ''}`).join('\n');

  const html = renderAlertEmail({
    tone: hasRisk ? 'warning' : 'info',
    badge: 'Novo sistema aguardando aprovação',
    title: `"${name}" foi solicitado como sistema novo`,
    intro: hasRisk
      ? `${requestedByUsername} pediu o deploy do sistema "${name}" e a análise encontrou ${findings.length} ponto(s) suspeito(s) no repositório clonado:`
      : `${requestedByUsername} pediu o deploy do sistema "${name}". Nenhum ponto suspeito encontrado no repositório clonado, mas toda solicitação de sistema novo precisa de aprovação.`,
    items: findings.map((f) => ({ label: f.label, meta: f.file ? `${f.file}:${f.line}` : null })),
    ctaLabel: `Revisar solicitação #${requestId}`,
    ctaUrl: `${BASE_URL}/admin/approvals`,
  });

  await sendMail({
    to,
    subject: `Geploy: novo sistema "${name}" aguardando aprovação`,
    text: `${requestedByUsername} pediu o deploy do sistema "${name}".\n\n${
      hasRisk ? `${findings.length} ponto(s) suspeito(s):\n${findingsList}\n\n` : ''
    }Revise e aprove ou rejeite em: ${BASE_URL}/admin/approvals (solicitação #${requestId})`,
    html,
  });
}

module.exports = { sendRiskAlert, sendDownAlert, sendDeployRequestAlert, adminEmails, ownerEmail };
