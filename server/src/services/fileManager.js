const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_FILE_BYTES = 1024 * 1024;
const BACKUPS_TO_KEEP = 20;
const BLOCKED_NAMES = new Set(['.git', 'node_modules']);
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const BACKUP_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'file-backups');

class FileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const blockedError = () => new FileError(403, 'Este caminho não pode ser acessado pelo painel.');

function cleanParts(rel) {
  if (rel == null || rel === '') return [];
  if (typeof rel !== 'string' || rel.includes('\0')) throw new FileError(400, 'Caminho inválido.');

  const parts = rel.split(/[\\/]+/).filter((p) => p && p !== '.');
  for (const part of parts) {
    // ".." e caracteres/formatos especiais do Windows (streams NTFS "a:b", nomes
    // reservados, ponto/espaco no fim que o Windows descarta) nunca sao validos aqui.
    if (part === '..' || /[:*?"<>|]/.test(part) || /[. ]$/.test(part) || RESERVED_NAMES.test(part)) {
      throw new FileError(400, 'Caminho inválido.');
    }
    if (BLOCKED_NAMES.has(part.toLowerCase())) throw blockedError();
  }
  return parts;
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * Resolve um caminho relativo dentro da pasta do sistema. Usa o caminho REAL do
 * disco (realpath), o que derruba atalhos/junctions que apontam para fora da pasta
 * e nomes curtos 8.3 (ex: GIT~1) que tentariam contornar o bloqueio de .git.
 */
function resolveWithin(system, rel) {
  const parts = cleanParts(rel);

  let realRoot;
  try {
    realRoot = fs.realpathSync.native(system.repo_path);
  } catch {
    throw new FileError(404, 'Pasta do sistema não encontrada no servidor.');
  }

  const candidate = path.join(realRoot, ...parts);
  let real;
  try {
    real = fs.realpathSync.native(candidate);
  } catch {
    throw new FileError(404, 'Arquivo ou pasta não encontrado.');
  }

  if (!isInside(realRoot, real)) throw new FileError(403, 'Caminho fora da pasta do sistema.');

  const relParts = path.relative(realRoot, real).split(path.sep).filter(Boolean);
  if (relParts.some((p) => BLOCKED_NAMES.has(p.toLowerCase()))) throw blockedError();

  return { real, relPath: relParts.join('/') };
}

function listDir(system, rel) {
  const { real, relPath } = resolveWithin(system, rel);
  if (!fs.statSync(real).isDirectory()) throw new FileError(400, 'Não é uma pasta.');

  const entries = [];
  for (const dirent of fs.readdirSync(real, { withFileTypes: true })) {
    if (BLOCKED_NAMES.has(dirent.name.toLowerCase())) continue;
    let stat;
    try {
      stat = fs.statSync(path.join(real, dirent.name));
    } catch {
      continue; // link quebrado ou sem permissao
    }
    entries.push({
      name: dirent.name,
      type: stat.isDirectory() ? 'dir' : 'file',
      size: stat.isDirectory() ? null : stat.size,
      mtime: stat.mtimeMs,
    });
  }

  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  return { path: relPath, entries };
}

function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}

function readFile(system, rel) {
  const { real, relPath } = resolveWithin(system, rel);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new FileError(400, 'Não é um arquivo.');
  if (stat.size > MAX_FILE_BYTES) throw new FileError(413, 'Arquivo grande demais para editar pelo painel (máximo 1 MB).');

  const buffer = fs.readFileSync(real);
  if (isBinary(buffer)) throw new FileError(415, 'Arquivo binário não pode ser editado pelo painel.');

  const content = buffer.toString('utf8');
  return { path: relPath, content, size: stat.size, mtime: stat.mtimeMs };
}

function backupDirFor(system, relPath) {
  const hash = crypto.createHash('sha1').update(relPath.toLowerCase()).digest('hex').slice(0, 16);
  return path.join(BACKUP_DIR, String(system.id), hash);
}

function backupFile(system, relPath, real) {
  const dir = backupDirFor(system, relPath);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(real, path.join(dir, `${stamp}.bak`));

  const old = fs.readdirSync(dir).filter((n) => n.endsWith('.bak')).sort().reverse().slice(BACKUPS_TO_KEEP);
  for (const name of old) fs.rmSync(path.join(dir, name), { force: true });
}

function writeFile(system, rel, content, expectedMtime) {
  if (typeof content !== 'string') throw new FileError(400, 'Conteúdo inválido.');
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
    throw new FileError(413, 'Conteúdo grande demais (máximo 1 MB).');
  }

  const { real, relPath } = resolveWithin(system, rel);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new FileError(400, 'Não é um arquivo.');
  if (stat.size > MAX_FILE_BYTES) throw new FileError(413, 'Arquivo grande demais para editar pelo painel (máximo 1 MB).');

  if (expectedMtime != null && Math.abs(stat.mtimeMs - Number(expectedMtime)) > 1) {
    throw new FileError(409, 'O arquivo foi alterado por outra pessoa depois que você o abriu. Recarregue antes de salvar.');
  }

  const old = fs.readFileSync(real);
  if (isBinary(old)) throw new FileError(415, 'Arquivo binário não pode ser editado pelo painel.');

  backupFile(system, relPath, real);

  // O navegador entrega as quebras de linha como \n; preserva o padrao do arquivo original.
  let text = content.replace(/\r\n/g, '\n');
  if (old.includes('\r\n')) text = text.replace(/\n/g, '\r\n');
  fs.writeFileSync(real, text, 'utf8');

  const saved = fs.statSync(real);
  return { path: relPath, size: saved.size, mtime: saved.mtimeMs };
}

function listBackups(system, rel) {
  const { relPath } = resolveWithin(system, rel);
  const dir = backupDirFor(system, relPath);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.bak'))
    .sort()
    .reverse()
    .map((id) => {
      const stat = fs.statSync(path.join(dir, id));
      return { id, created_at: stat.mtimeMs, size: stat.size };
    });
}

function readBackup(system, rel, id) {
  const { relPath } = resolveWithin(system, rel);
  const dir = backupDirFor(system, relPath);
  // So le arquivos que existem na listagem da pasta de backup (id nunca vira caminho).
  const exists = fs.existsSync(dir) && fs.readdirSync(dir).includes(String(id));
  if (!exists) throw new FileError(404, 'Versão anterior não encontrada.');
  return { content: fs.readFileSync(path.join(dir, String(id)), 'utf8') };
}

module.exports = { FileError, listDir, readFile, writeFile, listBackups, readBackup, MAX_FILE_BYTES };
