const { execFile } = require('node:child_process');
const fs = require('node:fs');
const { decrypt } = require('../crypto');

function run(cmd, args, options) {
  // O servico roda como SYSTEM e as pastas dos sistemas pertencem a outros
  // usuarios; sem isso o git recusa ("dubious ownership"). O cwd vem sempre do
  // cadastro do sistema, e -c e uma das fontes de config que o git respeita.
  const finalArgs =
    cmd === 'git' && options?.cwd
      ? ['-c', `safe.directory=${options.cwd.replace(/\\/g, '/')}`, ...args]
      : args;

  // Sem isso, um repositorio privado sem token/chave configurada faz o git
  // tentar abrir um prompt de credencial (Git Credential Manager) - que
  // nunca aparece porque o servico roda sem area de trabalho, entao o
  // processo (e os sub-processos que ele cria, tipo git-remote-https e
  // credential-manager) ficava pendurado para sempre, nunca derrubado pelo
  // timeout abaixo (o timeout do execFile so mata o processo direto, nao a
  // arvore inteira no Windows). Com GIT_TERMINAL_PROMPT=0 o git falha na
  // hora, com uma mensagem clara, em vez de travar.
  const finalOptions =
    cmd === 'git'
      ? { ...options, env: { GIT_TERMINAL_PROMPT: '0', ...(options?.env || {}) } }
      : options;

  return new Promise((resolve) => {
    execFile(cmd, finalArgs, { timeout: 2 * 60 * 1000, ...finalOptions }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        code: error?.code ?? 0,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
      });
    });
  });
}

/**
 * Monta os argumentos/env extras de autenticacao git a partir do registro do
 * sistema (nunca de dado vindo da requisicao). Reaproveitado por quem so
 * precisa ler o repositorio (fetch/diff) sem alterar a working tree.
 */
function buildAuth(system) {
  if (system.git_auth_type === 'https_token' && system.git_token_encrypted) {
    const token = decrypt(system.git_token_encrypted);
    const basic = Buffer.from(`${system.git_username || 'x-access-token'}:${token}`).toString('base64');
    return { extraArgs: ['-c', `http.extraheader=AUTHORIZATION: basic ${basic}`], env: {} };
  }
  if (system.git_auth_type === 'ssh_key' && system.git_ssh_key_path) {
    return {
      extraArgs: [],
      env: { GIT_SSH_COMMAND: `ssh -i "${system.git_ssh_key_path}" -o StrictHostKeyChecking=accept-new` },
    };
  }
  return { extraArgs: [], env: {} };
}

/**
 * Executa `git pull` na pasta do sistema. O caminho e as credenciais vem
 * exclusivamente do registro `system` carregado do banco (nunca da requisicao).
 */
async function gitPull(system) {
  if (!fs.existsSync(system.repo_path)) {
    return { success: false, output: `Pasta do repositorio nao encontrada: ${system.repo_path}` };
  }

  const { extraArgs, env } = buildAuth(system);
  const options = { cwd: system.repo_path, env: { ...process.env, ...env } };
  return run('git', [...extraArgs, 'pull', '--ff-only'], options);
}

module.exports = { gitPull, run, buildAuth };
