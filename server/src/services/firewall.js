const { execFile } = require('node:child_process');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 20 * 1000 }, (error, stdout, stderr) => {
      resolve({ success: !error, output: [stdout, stderr].filter(Boolean).join('\n').trim() });
    });
  });
}

/**
 * Consulta as regras reais do Windows Firewall (nao so as que o Geploy criou)
 * para ver se alguma ja libera entrada TCP nessa porta. Evita duplicar regra
 * numa porta que outro sistema/administrador ja liberou antes.
 */
async function isPortOpenInbound(port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return false;

  const script = [
    `$ports = Get-NetFirewallPortFilter -Protocol TCP -ErrorAction SilentlyContinue |`,
    `  Where-Object { $_.LocalPort -eq '${port}' }`,
    `$open = $false`,
    `foreach ($p in $ports) {`,
    `  $rule = $p | Get-NetFirewallRule -ErrorAction SilentlyContinue`,
    `  if ($rule -and $rule.Direction -eq 'Inbound' -and $rule.Action -eq 'Allow' -and $rule.Enabled -eq 'True') { $open = $true }`,
    `}`,
    `Write-Output $open`,
  ].join('\n');

  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  return result.success && /true/i.test(result.output);
}

/**
 * Garante que a porta esta liberada para entrada (TCP) no firewall do Windows.
 * Se alguma regra ja libera, nao faz nada (idempotente). Senao, cria uma regra
 * nova so para essa porta, nomeada para facilitar achar/remover depois.
 */
async function ensurePortOpenInbound(port, label) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { opened: false, alreadyOpen: false, success: false, output: `Porta inválida: ${port}` };
  }

  const already = await isPortOpenInbound(port);
  if (already) {
    return {
      opened: false,
      alreadyOpen: true,
      success: true,
      output: `Porta ${port}/TCP já estava liberada no firewall (regra existente encontrada).`,
    };
  }

  const ruleName = `Geploy - ${label || 'sistema'} (${port}/TCP)`;
  const result = await run('netsh', [
    'advfirewall',
    'firewall',
    'add',
    'rule',
    `name=${ruleName}`,
    'dir=in',
    'action=allow',
    'protocol=TCP',
    `localport=${port}`,
  ]);

  return {
    opened: result.success,
    alreadyOpen: false,
    success: result.success,
    output: result.success
      ? `Porta ${port}/TCP liberada no firewall (regra "${ruleName}" criada).`
      : `Falha ao liberar a porta ${port}/TCP no firewall:\n${result.output}`,
  };
}

module.exports = { isPortOpenInbound, ensurePortOpenInbound };
