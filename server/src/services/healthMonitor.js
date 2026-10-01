const db = require('../db');
const { performAction } = require('./processControl');
const { sendDownAlert } = require('./alerts');

const POLL_INTERVAL_MS = 60 * 1000;
const DOWN_THRESHOLD_MS = 3 * 60 * 1000;

function isUp(result) {
  if (!result?.success) return false;
  const output = (result.output || '').toLowerCase();
  return output.includes('running') || output.includes('started');
}

async function checkSystem(system) {
  let result;
  try {
    result = await performAction(system, 'status');
  } catch (err) {
    result = { success: false, output: err.message };
  }

  const up = isUp(result);

  if (up) {
    if (system.last_status !== 'up') {
      db.prepare('UPDATE systems SET last_status=?, down_since=NULL, down_alert_sent=0 WHERE id=?').run(
        'up',
        system.id
      );
    }
    return;
  }

  // Sistema fora do ar nesta checagem.
  if (!system.down_since) {
    db.prepare("UPDATE systems SET last_status='down', down_since=? WHERE id=?").run(Date.now(), system.id);
    return;
  }

  const downForMs = Date.now() - system.down_since;
  if (downForMs >= DOWN_THRESHOLD_MS && !system.down_alert_sent) {
    db.prepare('UPDATE systems SET down_alert_sent=1 WHERE id=?').run(system.id);
    try {
      await sendDownAlert(system);
    } catch (err) {
      console.error(`Falha ao enviar alerta de queda para "${system.name}":`, err.message);
    }
  }
}

async function checkAllSystems() {
  const systems = db.prepare('SELECT * FROM systems').all();
  for (const system of systems) {
    await checkSystem(system);
  }
}

function startHealthMonitor() {
  checkAllSystems().catch((err) => console.error('Erro no monitor de saude:', err.message));
  setInterval(() => {
    checkAllSystems().catch((err) => console.error('Erro no monitor de saude:', err.message));
  }, POLL_INTERVAL_MS);
}

module.exports = { startHealthMonitor };
