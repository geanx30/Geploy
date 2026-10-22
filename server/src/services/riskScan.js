// Padroes suspeitos verificados apenas nas linhas ADICIONADAS do diff.
// Checagem por padrao (sem IA): rapida e sem custo, porem mais rasa.
const RISK_PATTERNS = [
  {
    id: 'destructive-fs',
    label: 'Comando destrutivo de arquivos/disco',
    re: /\b(rm\s+-rf|rd\s+\/s|del\s+\/[sf]|Remove-Item\s+-Recurse|format\s+[a-z]:)/i,
  },
  {
    id: 'dynamic-exec',
    label: 'Execução dinâmica de código',
    re: /\b(eval\(|new Function\(|Invoke-Expression\b|IEX\(|child_process\.(exec|execSync)\()/,
  },
  {
    id: 'remote-download-exec',
    label: 'Download e execução de código remoto',
    re: /(DownloadString|DownloadFile|Invoke-WebRequest.*\|\s*iex|curl\s[^|]*\|\s*(sh|bash)|wget\s[^|]*\|\s*(sh|bash))/i,
  },
  {
    id: 'hardcoded-secret',
    label: 'Possível segredo/credencial hardcoded',
    re: /(api[_-]?key|secret|senha|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
  {
    id: 'disable-tls',
    label: 'Desativação de verificação TLS/SSL',
    re: /(NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true)/,
  },
  {
    id: 'env-exfiltration',
    label: 'Possível envio de variáveis de ambiente para fora',
    re: /process\.env\b/,
    contextRe: /(fetch\(|axios\.|http\.request|https\.request|requests\.(post|get)|XMLHttpRequest)/,
  },
  {
    id: 'reverse-shell',
    label: 'Possível shell reverso / conexão de rede crua',
    re: /\b(nc\s+-e|\/dev\/tcp\/|new\s+net\.Socket\(|socket\.connect\()/i,
  },
  {
    id: 'other-service-control',
    label: 'Controle de outro serviço/processo do sistema',
    re: /\b(sc\.exe\s+(stop|delete)|Stop-Service\b|taskkill\s+\/f|schtasks\s+\/create)/i,
  },
];

function checkLine(content) {
  const hits = [];
  for (const pattern of RISK_PATTERNS) {
    if (pattern.re.test(content) && (!pattern.contextRe || pattern.contextRe.test(content))) {
      hits.push({ patternId: pattern.id, label: pattern.label, snippet: content.trim().slice(0, 200) });
    }
  }
  return hits;
}

/**
 * Varre o texto de um `git diff` (formato unificado) procurando padroes de
 * risco apenas nas linhas adicionadas, com arquivo/linha para referencia.
 */
function scanDiff(diffText) {
  if (!diffText) return [];

  const findings = [];
  let currentFile = null;
  let newLineNo = null;

  for (const rawLine of diffText.split('\n')) {
    if (rawLine.startsWith('+++ ')) {
      currentFile = rawLine.slice(4).replace(/^b\//, '').trim();
      continue;
    }
    if (rawLine.startsWith('--- ')) continue;

    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLineNo = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (rawLine.startsWith('+')) {
      const content = rawLine.slice(1);
      for (const hit of checkLine(content)) {
        findings.push({ file: currentFile, line: newLineNo, ...hit });
      }
      if (newLineNo != null) newLineNo++;
    } else if (rawLine.startsWith(' ')) {
      if (newLineNo != null) newLineNo++;
    }
    // linhas removidas (-) nao avancam o contador da nova versao
  }

  return findings;
}

const fs = require('node:fs');
const path = require('node:path');

const SCAN_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'venv', '__pycache__']);
const MAX_FILE_BYTES_TO_SCAN = 512 * 1024;
const MAX_FILES_TO_SCAN = 2000;
const MAX_FINDINGS = 200;

function isBinaryBuffer(buf) {
  return buf.subarray(0, 8000).includes(0);
}

/**
 * Varre TODOS os arquivos de texto de uma pasta (usado no deploy de um
 * sistema novo, onde nao existe "diff" — o repositorio inteiro acabou de
 * ser clonado). Mesmos padroes do scanDiff, porem linha por linha no
 * conteudo atual dos arquivos, nao em cima de um git diff.
 */
function scanTree(rootPath) {
  const findings = [];
  let filesScanned = 0;

  function walk(dir) {
    if (findings.length >= MAX_FINDINGS || filesScanned >= MAX_FILES_TO_SCAN) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (findings.length >= MAX_FINDINGS || filesScanned >= MAX_FILES_TO_SCAN) return;
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;

      filesScanned++;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size === 0 || stat.size > MAX_FILE_BYTES_TO_SCAN) continue;

      let buf;
      try {
        buf = fs.readFileSync(full);
      } catch {
        continue;
      }
      if (isBinaryBuffer(buf)) continue;

      const relFile = path.relative(rootPath, full).split(path.sep).join('/');
      const lines = buf.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const hit of checkLine(lines[i])) {
          findings.push({ file: relFile, line: i + 1, ...hit });
          if (findings.length >= MAX_FINDINGS) break;
        }
        if (findings.length >= MAX_FINDINGS) break;
      }
    }
  }

  walk(rootPath);
  return findings;
}

module.exports = { scanDiff, scanTree };
