const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 500) * 1024 * 1024;
// Acima disso, sobrescrever por upload nao guarda copia (evita encher o disco com bancos grandes).
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
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

/**
 * Como resolveWithin, mas para um arquivo que pode ainda nao existir (upload):
 * exige que a PASTA onde ele vai ficar exista dentro do sistema; o nome do
 * arquivo em si passa pelas mesmas checagens (sem precisar existir no disco).
 */
function resolveForUpload(system, rel) {
  const parts = cleanParts(rel);
  if (parts.length === 0) throw new FileError(400, 'Informe o nome do arquivo.');
  const fileName = parts[parts.length - 1];

  const { real: realDir, relPath: relDir } = resolveWithin(system, parts.slice(0, -1).join('/'));
  if (!fs.statSync(realDir).isDirectory()) throw new FileError(400, 'Não é uma pasta.');

  const real = path.join(realDir, fileName);
  const relPath = relDir ? `${relDir}/${fileName}` : fileName;
  return { real, relPath, dir: realDir };
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

/**
 * Resolve um arquivo para download: mesmas checagens de caminho do resto do
 * modulo, mas sem limite de tamanho nem bloqueio de binario (ao contrario do
 * editor, aqui o conteudo nunca entra na memoria do servidor).
 */
function resolveDownload(system, rel) {
  const { real, relPath } = resolveWithin(system, rel);
  if (!fs.statSync(real).isFile()) throw new FileError(400, 'Não é um arquivo.');
  return { real, relPath, name: path.basename(relPath) };
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

/**
 * Apaga um arquivo (nunca uma pasta, de proposito — exclusao de pasta inteira
 * fica fora do escopo do painel). Guarda uma copia em backup antes, igual ao
 * editor, para poder recuperar.
 */
function deleteFile(system, rel) {
  const { real, relPath } = resolveWithin(system, rel);
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw new FileError(400, 'Só é possível excluir arquivos, não pastas.');

  if (stat.size <= MAX_BACKUP_BYTES) {
    try {
      backupFile(system, relPath, real);
    } catch {
      // backup e um "melhor esforco": nao bloqueia a exclusao se falhar
    }
  }

  fs.unlinkSync(real);
  return { path: relPath };
}

/**
 * Recebe um upload em streaming (sem carregar na memoria) e grava com
 * escrita-em-temp + rename atomico (mesma pasta, mesmo volume). Se o destino
 * ja existir, so sobrescreve com `overwrite: true` (o chamador confirma antes).
 */
async function uploadFile(system, rel, readable, { overwrite } = {}) {
  const { real, relPath, dir } = resolveForUpload(system, rel);

  const exists = fs.existsSync(real);
  if (exists) {
    if (fs.statSync(real).isDirectory()) throw new FileError(400, 'Já existe uma pasta com esse nome.');
    if (!overwrite) {
      const err = new FileError(409, 'Já existe um arquivo com esse nome.');
      err.code = 'exists';
      throw err;
    }
  }

  const tmp = path.join(dir, `.upload-${crypto.randomBytes(8).toString('hex')}.tmp`);
  let written = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      written += chunk.length;
      if (written > MAX_UPLOAD_BYTES) return cb(new Error('TOO_LARGE'));
      cb(null, chunk);
    },
  });

  try {
    await pipeline(readable, limiter, fs.createWriteStream(tmp));
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    if (err.message === 'TOO_LARGE') {
      throw new FileError(413, `Arquivo maior que o limite de upload (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`);
    }
    throw new FileError(400, 'Falha ao receber o arquivo (envio interrompido?).');
  }

  if (exists && overwrite) {
    const oldSize = fs.statSync(real).size;
    if (oldSize <= MAX_BACKUP_BYTES) {
      try {
        backupFile(system, relPath, real);
      } catch {
        // backup e um "melhor esforco": nao bloqueia o upload se falhar
      }
    }
  }

  fs.renameSync(tmp, real);
  const saved = fs.statSync(real);
  return { path: relPath, size: saved.size, mtime: saved.mtimeMs, overwritten: exists };
}

function listBackups(system, rel) {
  // resolveForUpload (nao resolveWithin): o arquivo pode ter sido excluido, mas
  // o backup continua la e precisa ficar consultavel mesmo assim.
  const { relPath } = resolveForUpload(system, rel);
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
  const { relPath } = resolveForUpload(system, rel);
  const dir = backupDirFor(system, relPath);
  // So le arquivos que existem na listagem da pasta de backup (id nunca vira caminho).
  const exists = fs.existsSync(dir) && fs.readdirSync(dir).includes(String(id));
  if (!exists) throw new FileError(404, 'Versão anterior não encontrada.');
  return { content: fs.readFileSync(path.join(dir, String(id)), 'utf8') };
}

module.exports = {
  FileError,
  listDir,
  readFile,
  writeFile,
  uploadFile,
  deleteFile,
  resolveDownload,
  listBackups,
  readBackup,
  MAX_FILE_BYTES,
  MAX_UPLOAD_BYTES,
};
