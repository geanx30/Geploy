const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

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

const CD_RE = /^cd(\s+\/d)?(\s+(.*))?$/i;

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Cada comando roda em um cmd.exe novo (sem estado de shell entre linhas), entao
 * um "cd pasta" normal nao teria nenhum efeito na linha seguinte. Trata "cd"
 * separadamente, carregando a pasta atual entre as linhas, como num script.
 */
function tryChangeDir(line, cwd, repoRoot) {
  const match = line.match(CD_RE);
  if (!match) return null;

  const arg = (match[3] || '').trim().replace(/^["']|["']$/g, '');
  if (!arg) return { cwd }; // "cd" sozinho so informaria a pasta atual, sem mudar nada

  const next = path.resolve(cwd, arg);
  if (!isInside(repoRoot, next)) {
    return { error: `Não é permitido sair da pasta do sistema (${repoRoot}).` };
  }
  if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
    return { error: `Pasta não encontrada: ${next}` };
  }
  return { cwd: next };
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
  let cwd = system.repo_path;

  for (const line of lines) {
    const cdResult = tryChangeDir(line, cwd, system.repo_path);
    if (cdResult) {
      if (cdResult.error) {
        blocks.push(`$ ${line}\n${cdResult.error}`);
        return { success: false, output: blocks.join('\n\n') };
      }
      cwd = cdResult.cwd;
      blocks.push(`$ ${line}\n(pasta atual: ${cwd})`);
      continue;
    }

    const result = await runLine(line, cwd);
    blocks.push(`$ ${line}\n${result.output}`.trim());
    if (!result.success) {
      return { success: false, output: blocks.join('\n\n') };
    }
  }
  return { success: true, output: blocks.join('\n\n') };
}

module.exports = { runPostUpdateCommands };
