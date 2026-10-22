const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { run, buildAuth } = require('./git');
const { encrypt } = require('../crypto');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'venv', '__pycache__']);
const ENV_TEMPLATE_RE = /^\.env\.(example|sample|template)$/i;

/**
 * Clona um repositorio novo para `targetDir` (ainda fora de C:\Sistemas ate a
 * aprovacao; fica numa pasta de "rascunho" em data/deploy-staging). Reaproveita
 * o mesmo esquema de autenticacao usado nos sistemas ja cadastrados.
 */
async function cloneRepo({ repoUrl, gitAuthType, gitUsername, gitToken, gitSshKeyPath, targetDir }) {
  if (fs.existsSync(targetDir)) {
    return { success: false, output: `A pasta de destino já existe: ${targetDir}` };
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  const authLike = {
    git_auth_type: gitAuthType || 'none',
    git_token_encrypted: gitToken ? encrypt(gitToken) : null,
    git_username: gitUsername || null,
    git_ssh_key_path: gitSshKeyPath || null,
  };
  const { extraArgs, env } = buildAuth(authLike);
  const options = { cwd: path.dirname(targetDir), env: { ...process.env, ...env }, timeout: 5 * 60 * 1000 };

  // Se for um caminho local (repo interno em disco/rede, nao uma URL de verdade),
  // o git recusaria por "dubious ownership" igual acontecia com as pastas dos
  // sistemas ja cadastrados — mesma solucao aplicada aqui.
  const safeDirArgs = repoUrl.includes('://') ? [] : ['-c', `safe.directory=${repoUrl.replace(/\\/g, '/')}`];

  const result = await run('git', [...safeDirArgs, ...extraArgs, 'clone', '--depth', '1', repoUrl, targetDir], options);

  if (!result.success) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  return result;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Procura .env.example/.sample/.template na raiz e nas subpastas do clone
 * (ex.: server/.env.example, client/.env.example), para o admin preencher os
 * valores reais antes do primeiro start.
 */
function findEnvTemplates(rootPath, maxDepth = 3) {
  const results = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile() || !ENV_TEMPLATE_RE.test(entry.name)) continue;

      const relDir = path.relative(rootPath, dir).split(path.sep).filter(Boolean).join('/');
      const keys = [];
      for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (match) keys.push({ key: match[1], defaultValue: match[2].trim().replace(/^["']|["']$/g, '') });
      }

      results.push({
        templatePath: path.relative(rootPath, full).split(path.sep).join('/'),
        targetPath: relDir ? `${relDir}/.env` : '.env',
        keys,
      });
    }
  }

  walk(rootPath, 0);
  return results;
}

/**
 * Escreve os .env reais a partir dos valores que o admin preencheu no
 * formulario (um por template encontrado). So roda depois da aprovacao.
 */
function writeEnvFiles(rootPath, envFiles) {
  for (const { targetPath, values } of envFiles || []) {
    const parts = targetPath.split('/').filter(Boolean);
    if (parts.some((p) => p === '..' || SKIP_DIRS.has(p))) continue; // defesa extra, caminho sempre vem do nosso proprio findEnvTemplates
    const full = path.join(rootPath, ...parts);
    const lines = Object.entries(values || {}).map(([key, value]) => `${key}=${value ?? ''}`);
    fs.writeFileSync(full, lines.join('\n') + '\n', 'utf8');
  }
}

function getListeningPorts() {
  const ports = new Set();
  try {
    const out = execSync('netstat -ano -p tcp', { windowsHide: true, timeout: 10000 }).toString();
    for (const line of out.split('\n')) {
      if (!/LISTENING/i.test(line)) continue;
      const cols = line.trim().split(/\s+/);
      const match = cols[1] && cols[1].match(/:(\d+)$/);
      if (match) ports.add(Number(match[1]));
    }
  } catch {
    // netstat falhando nao deve travar o assistente, so fica sem essa info
  }
  return ports;
}

/**
 * Sugere portas livres (ainda nao escutadas no SO e nao usadas por nenhum
 * sistema ja cadastrado no Geploy) para o admin escolher no card do sistema novo.
 */
function suggestPorts(usedByRegisteredSystems = [], count = 8, range = [3000, 9000]) {
  const used = new Set([...getListeningPorts(), ...usedByRegisteredSystems]);
  const suggestions = [];
  for (let p = range[0]; p < range[1] && suggestions.length < count; p++) {
    if (!used.has(p)) suggestions.push(p);
  }
  return { suggestions, used: [...used].sort((a, b) => a - b) };
}

module.exports = { cloneRepo, removeDir, findEnvTemplates, writeEnvFiles, suggestPorts };
