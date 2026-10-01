// Templates de e-mail em HTML com tabelas + estilos inline (compatibilidade
// com Outlook/Office365 e demais clientes, que ignoram <style> em muitos casos).

const COLORS = {
  danger: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', accent: '#dc2626' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', accent: '#d97706' },
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderAlertEmail({ tone = 'warning', badge, title, intro, items = [], ctaLabel, ctaUrl, footerNote }) {
  const c = COLORS[tone] || COLORS.warning;

  const itemsHtml = items.length
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
        ${items
          .map(
            (item) => `
          <tr>
            <td style="padding:10px 14px;background:${c.bg};border:1px solid ${c.border};border-radius:8px;margin-bottom:8px;display:block;">
              <span style="font-size:13px;font-weight:600;color:${c.text};">${escapeHtml(item.label)}</span>
              ${item.meta ? `<br/><span style="font-size:12px;color:${c.text};opacity:0.75;font-family:monospace;">${escapeHtml(item.meta)}</span>` : ''}
            </td>
          </tr>
          <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>`
          )
          .join('')}
      </table>`
    : '';

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:10px;background:#3863f5;">
            <a href="${ctaUrl}" target="_blank"
               style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
              ${escapeHtml(ctaLabel)} →
            </a>
          </td>
        </tr>
      </table>`
      : '';

  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:20px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,#5f8cff,#2748d6);text-align:center;vertical-align:middle;font-size:16px;">
                      🚀
                    </td>
                    <td style="padding-left:10px;color:#ffffff;font-size:15px;font-weight:700;">Geploy</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 28px 8px;">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${c.bg};color:${c.text};font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;border:1px solid ${c.border};">
                  ${escapeHtml(badge)}
                </span>
                <h1 style="margin:14px 0 0;font-size:19px;line-height:1.4;color:#0f172a;">${escapeHtml(title)}</h1>
              </td>
            </tr>

            <tr>
              <td style="padding:4px 28px 0;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;white-space:pre-line;">${escapeHtml(intro)}</p>
                ${itemsHtml}
                ${ctaHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:28px;">
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;" />
                <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
                  ${escapeHtml(footerNote || 'Este é um alerta automático do Geploy — painel de deploy da VM-SISTEMAS.')}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { renderAlertEmail };
