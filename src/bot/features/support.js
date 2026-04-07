const { Markup } = require('telegraf');
const logger = require('../../utils/logger');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

const ISSUE_TYPES = {
  'ENGINE': '🚀 Falha na Impulsão (Motor)',
  'WALLET': '🔌 Desconexão do Inventário',
  'PRICE': '💎 Erro no Radar de Gemas',
  'TX': '⏳ Explosão Travada (Pending)',
  'PAUSE': '🛑 O Bomber parou sozinho',
  'OTHER': '⚙️ Outro Bug no Sistema'
};

/**
 * Step 1: Support Menu with categorizations
 */
async function supportPanelHandler(ctx) {
  const text = `🛠️ <b>SUPORTE AO PLAYER</b>\n\n` +
    `Escolha o erro detectado na arena para que possamos debugar o sistema com precisão:\n\n` +
    `<i>Seu reporte será enviado diretamente ao Game Master.</i>`;

  const buttons = Object.entries(ISSUE_TYPES).map(([key, label]) => ([
    Markup.button.callback(label, `report_issue_type_${key}`)
  ]));

  buttons.push([Markup.button.callback('⬅️ Voltar', 'support_link')]);

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

/**
 * Step 2: Final Report Execution
 */
async function reportIssueHandler(ctx, typeKey = 'OTHER') {
  const userId = ctx.from.id;
  const username = ctx.from.username || 'Sem Username';
  const firstName = ctx.from.first_name || 'Usuário';
  const issueLabel = ISSUE_TYPES[typeKey] || typeKey;
  
  const textAdmin = `🚨 <b>MISSÃO CRÍTICA: BUG REPORT</b>\n\n` +
    `👤 <b>Player:</b> ${firstName} (@${username})\n` +
    `🆔 <b>ID:</b> <code>${userId}</code>\n` +
    `🏷️ <b>Bug:</b> ${issueLabel}\n` +
    `🕒 <b>Data:</b> ${new Date().toLocaleString('pt-BR')}\n\n` +
    `<i>O player relatou uma falha na arena. Verifique os logs agora.</i>`;

  try {
    if (!ADMIN_ID) {
      logger.warn('[Support] ADMIN_TELEGRAM_ID not configured.');
      return ctx.answerCbQuery('❌ O suporte direto não está disponível. @SeuSuporteUser');
    }

    await ctx.telegram.sendMessage(ADMIN_ID, textAdmin, { parse_mode: 'HTML' });
    
    await ctx.answerCbQuery(`✅ Reportado: ${issueLabel}\nAnalisaremos os registros do sistema.`, { show_alert: true });
    
    logger.info(`[Support] User ${userId} reported: ${typeKey}`);
    
    // Auto-return to home
    const { startHandler } = require('../commands/start');
    return startHandler(ctx);
    
  } catch (error) {
    logger.error('[Support] Failed to notify admin:', error);
    await ctx.answerCbQuery('❌ Erro ao enviar notificação. @SeuSuporteUser');
  }
}

module.exports = {
  supportPanelHandler,
  reportIssueHandler
};
