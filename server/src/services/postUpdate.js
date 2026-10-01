const { execFile } = require('node:child_process');

function runLine(line, cwd) {
  return new Promise((resolve) => {
    execFile(
      'cmd.exe',
      ['/d', '/s', '/c', line],
      { cwd, timeout: 10 * 60 * 1000, env: process.env, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          output: [stdout, stderr].filter(Boolean).join('\n').trim(),
        });
      }
    );
  });
}

/**
 * Executa, em sequencia, os comandos configurados pelo admin para este sistema
 * (um por linha, em `system.post_update_commands`), na pasta do repositorio.
 * Para na primeira falha. Comandos vem exclusivamente do registro do sistema
 * no banco (configuracao de admin), nunca de uma requisicao de usuario comum.
 */
async function runPostUpdateCommands(system) {
  const lines = (system.post_update_commands || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { success: true, output: '' };
  }

  const blocks = [];
  for (const line of lines) {
    const result = await runLine(line, system.repo_path);
    blocks.push(`$ ${line}\n${result.output}`.trim());
    if (!result.success) {
      return { success: false, output: blocks.join('\n\n') };
    }
  }
  return { success: true, output: blocks.join('\n\n') };
}

module.exports = { runPostUpdateCommands };
