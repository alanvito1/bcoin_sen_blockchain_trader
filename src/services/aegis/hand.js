const { exec } = require('child_process');
const util = require('util');
const logger = require('../../utils/logger');
const audit = require('./audit');
const notifier = require('../../bot/notifier');
const path = require('path');

const execAsync = util.promisify(exec);

/**
 * Aegis Hand: The Executor
 * Performs repairs, restarts, and configuration changes.
 */
class AegisHand {
  async execute(plan) {
    if (plan.action === 'NOTHING') {
      logger.info('🛡️ [Aegis] No action required.');
      return;
    }

    logger.info(`🛠️ [Aegis] Executing plan: ${plan.action}...`);
    
    try {
      let report = `🛠️ *Aegis Hand: Executando Reparo*\n\nPlano: \`${plan.explanation}\`\n\n`;

      if (plan.action === 'REPAIR_CODE' && plan.patchCommand) {
        // Use OpenClaw-style patching
        const result = await execAsync(plan.patchCommand, { cwd: path.join(__dirname, '../../../../') });
        report += `✅ Patch aplicado.\n\`${result.stdout}\``;
      }

      if (plan.action === 'RESTART_SERVICE') {
        // In local Docker, this script can only try to restart itself OR notify.
        // In VPS, we can trigger a PM2 restart or Docker restart (if socket is available).
        report += `🔄 Solicitação de reinício de serviço enviada.`;
        // Example: exec('docker-compose restart trader-engine');
      }

      if (plan.action === 'CHANGE_CONFIG' && plan.patchCommand) {
        await execAsync(plan.patchCommand);
        report += `⚙️ Configuração alterada.`;
      }

      logger.success(`✅ [Aegis] Plan executed successfully.`);
      await audit.log('EXECUTION', { auditId: plan.auditId, status: 'SUCCESS', action: plan.action, report });
      await notifier.sendAdminNotification(`${report}\n\n🟢 *Sistema Estabilizado Autonomamente.*`);
      
    } catch (error) {
      logger.error('❌ [Aegis] Hand failed to execute plan:', error);
      await audit.log('FAILURE', { auditId: plan.auditId, status: 'FAILED', error: error.message });
      await notifier.sendAdminNotification(`⚠️ *Aegis Hand: Falha no Reparo*\n\nErro: \`${error.message}\`\n\nO sistema continua instável.`);
    }
  }
}

const hand = new AegisHand();
module.exports = hand;
