const { Markup } = require('telegraf');
const logger = require('../../utils/logger');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

const ISSUE_TYPES = {
  'ENGINE': '🚀 Motor não abre/não inicia',
  'WALLET': '🔌 Carteira desconectou/erro',
  'PRICE': '💎 Erro na cotação de moedas',
  'TX': '⏳ Transação travada (Pending)',
  'PAUSE': '🛑 O robô parou sozinho',
  'OTHER': '⚙️ Outro problema técnico'
};

/**
 * Step 1: Support Menu with categorizations
 */
async function supportPanelHandler(ctx) {
  const text = `🛠️ <b>CENTRAL DE NOTIFICAÇÕES</b>\n\n` +
    `Escolha o motivo técnico do seu relato para que possamos analisar os logs com precisão:\n\n` +
    `<i>Seu reporte será enviado diretamente ao administrador.</i>`;

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
  
  const textAdmin = `🚨 <b>ALERTA DE SUPORTE - BOT</b>\n\n` +
    `👤 <b>Usuário:</b> ${firstName} (@${username})\n` +
    `🆔 <b>ID:</b> <code>${userId}</code>\n` +
    `🏷️ <b>Motivo:</b> ${issueLabel}\n` +
    `🕒 <b>Data:</b> ${new Date().toLocaleString('pt-BR')}\n\n` +
    `<i>O usuário relatou este problema. Verifique os logs do sistema.</i>`;

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
