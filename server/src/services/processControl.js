const { execFile } = require('node:child_process');
const path = require('node:path');

const APPCMD = path.join(process.env.WINDIR || 'C:\\Windows', 'system32', 'inetsrv', 'appcmd.exe');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 60 * 1000 }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
      });
    });
  });
}

async function windowsServiceAction(serviceName, action) {
  if (action === 'start') return run('sc.exe', ['start', serviceName]);
  if (action === 'stop') return run('sc.exe', ['stop', serviceName]);
  if (action === 'restart') {
    const stopRes = await run('sc.exe', ['stop', serviceName]);
    await new Promise((r) => setTimeout(r, 2000));
    const startRes = await run('sc.exe', ['start', serviceName]);
    return {
      success: startRes.success,
      output: `${stopRes.output}\n${startRes.output}`.trim(),
    };
  }
  if (action === 'status') return run('sc.exe', ['query', serviceName]);
  throw new Error(`Acao desconhecida: ${action}`);
}

async function iisSiteAction(system, action) {
  const siteArgs = ['site', action === 'start' ? 'start' : 'stop', `/site.name:${system.site_name}`];
  if (action === 'restart') {
    const stopRes = await run(APPCMD, ['site', 'stop', `/site.name:${system.site_name}`]);
    if (system.app_pool_name) {
      await run(APPCMD, ['recycle', 'apppool', `/apppool.name:${system.app_pool_name}`]);
    }
    const startRes = await run(APPCMD, ['site', 'start', `/site.name:${system.site_name}`]);
    return { success: startRes.success, output: `${stopRes.output}\n${startRes.output}`.trim() };
  }
  if (action === 'status') {
    return run(APPCMD, ['list', 'site', `/site.name:${system.site_name}`]);
  }
  return run(APPCMD, siteArgs);
}

/**
 * Dispara start/stop/restart/status no processo do sistema.
 * `system.process_type` e os nomes de servico/site vem sempre do banco.
 */
async function performAction(system, action) {
  if (system.process_type === 'windows_service') {
    return windowsServiceAction(system.service_name, action);
  }
  if (system.process_type === 'iis_site') {
    return iisSiteAction(system, action);
  }
  throw new Error(`process_type desconhecido: ${system.process_type}`);
}

module.exports = { performAction };
