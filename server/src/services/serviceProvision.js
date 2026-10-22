const { execFile } = require('node:child_process');

const NSSM_PATH = process.env.NSSM_PATH || 'C:\\nssm\\win64\\nssm.exe';

// nssm.exe escreve no console em UTF-16LE (apps nativos de Windows), entao
// pede o retorno como buffer bruto e decodifica certo em vez do utf8 padrao
// do execFile (que deixaria um \x00 entre cada letra).
function decodeNssmOutput(buf) {
  if (!buf || buf.length === 0) return '';
  return buf.toString('utf16le').replace(/\0/g, '').trim();
}

function runNssm(args) {
  return new Promise((resolve) => {
    execFile(
      NSSM_PATH,
      args,
      { timeout: 30 * 1000, windowsHide: true, encoding: 'buffer' },
      (error, stdout, stderr) => {
        const output = [decodeNssmOutput(stdout), decodeNssmOutput(stderr)].filter(Boolean).join('\n').trim();
        resolve({ success: !error, output });
      }
    );
  });
}

const CMD_EXE = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';

/**
 * Cria e inicia um Windows Service via NSSM (mesmo binario ja usado pelos
 * demais sistemas deste servidor). So roda depois da aprovacao do deploy.
 *
 * O comando sempre roda atras de "cmd.exe /c", em vez de tentarmos separar
 * nos mesmos o executavel dos argumentos: assim "npm start"/"npm run build"
 * funcionam direto (npm e um .cmd, nao um .exe, entao o Windows so sabe
 * rodar via um interpretador de shell) e o comando inteiro, com aspas e
 * espacos, e interpretado do mesmo jeito que seria num terminal normal.
 */
async function createWindowsService({ serviceName, command, appDirectory, stdoutLog, stderrLog }) {
  const steps = [];

  const install = await runNssm(['install', serviceName, CMD_EXE, '/c', command]);
  steps.push(`$ nssm install ${serviceName} ...\n${install.output}`);
  if (!install.success) {
    return { success: false, output: steps.join('\n\n') };
  }

  if (appDirectory) await runNssm(['set', serviceName, 'AppDirectory', appDirectory]);
  if (stdoutLog) await runNssm(['set', serviceName, 'AppStdout', stdoutLog]);
  if (stderrLog) await runNssm(['set', serviceName, 'AppStderr', stderrLog]);
  await runNssm(['set', serviceName, 'AppRotateFiles', '1']);
  await runNssm(['set', serviceName, 'Start', 'SERVICE_AUTO_START']);

  const start = await runNssm(['start', serviceName]);
  steps.push(`$ nssm start ${serviceName}\n${start.output}`);
  return { success: start.success, output: steps.join('\n\n') };
}

/** Desfaz a criacao do servico (usado se algo falhar depois de instalar). */
async function removeWindowsService(serviceName) {
  await runNssm(['stop', serviceName]);
  return runNssm(['remove', serviceName, 'confirm']);
}

module.exports = { createWindowsService, removeWindowsService };
