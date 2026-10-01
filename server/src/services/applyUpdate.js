const { gitPull } = require('./git');
const { runPostUpdateCommands } = require('./postUpdate');

/**
 * Aplica de fato a atualizacao: git pull (ff-only) e, se tiver sucesso, os
 * comandos pos-atualizacao em sequencia. Usado tanto pelo fluxo direto
 * (sem risco, ou admin) quanto pela aprovacao de uma solicitacao pendente.
 */
async function applySystemUpdate(system, commandsOverride) {
  const pullResult = await gitPull(system);
  let result = pullResult;

  const commands = typeof commandsOverride === 'string' ? commandsOverride : system.post_update_commands;

  if (pullResult.success && commands) {
    const postResult = await runPostUpdateCommands({ ...system, post_update_commands: commands });
    result = {
      success: postResult.success,
      output: [pullResult.output, postResult.output].filter(Boolean).join('\n\n'),
    };
  }

  return result;
}

module.exports = { applySystemUpdate };
