const fs = require('node:fs');
const { run, buildAuth } = require('./git');
const { scanDiff } = require('./riskScan');

/**
 * `git fetch` + diff entre HEAD e o que viria do remoto, SEM aplicar nada na
 * working tree (fetch so atualiza refs remotas). Usado para mostrar ao
 * usuario o que vai mudar, e para o scanner de risco analisar antes do pull.
 */
async function previewUpdate(system) {
  if (!fs.existsSync(system.repo_path)) {
    return { success: false, error: `Pasta do repositorio nao encontrada: ${system.repo_path}` };
  }

  const { extraArgs, env } = buildAuth(system);
  const options = { cwd: system.repo_path, env: { ...process.env, ...env } };

  const fetchResult = await run('git', [...extraArgs, 'fetch'], options);
  if (!fetchResult.success) {
    return { success: false, error: fetchResult.output };
  }

  const statResult = await run('git', ['diff', '--stat', 'HEAD..FETCH_HEAD'], options);
  const textResult = await run('git', ['diff', 'HEAD..FETCH_HEAD'], options);

  const diffStat = statResult.output.trim();
  const diffText = textResult.output;
  const hasChanges = diffStat.length > 0;
  const findings = hasChanges ? scanDiff(diffText) : [];

  return { success: true, hasChanges, diffStat, diffText, findings };
}

module.exports = { previewUpdate };
