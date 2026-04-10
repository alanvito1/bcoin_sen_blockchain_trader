const { Markup, Scenes } = require('telegraf');
const logger = require('../../utils/logger');
const prisma = require('../../config/prisma');

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
  const text = `🛠️ <b>SUPORTE AO PLAYER (Zero-Support Stealth)</b>\n\n` +
    `Como somos um sistema autônomo, não possuímos chat humano direto para evitar exposição dos Game Masters.\n\n` +
    `Escolha a categoria do problema para abrir um <b>Ticket de Operação</b>. Analisaremos os logs da sua conta em até 24h:\n\n` +
    `<i>Seu reporte será criptografado e enviado ao admin.</i>`;

  const buttons = Object.entries(ISSUE_TYPES).map(([key, label]) => ([
    Markup.button.callback(label, `open_ticket_${key}`)
  ]));

  buttons.push([Markup.button.callback('⬅️ Voltar', 'start_panel')]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }
  return ctx.replyWithHTML(text, keyboard);
}

/**
 * SUPPORT_WIZARD: Captures the issue text from user
 */
const supportWizard = new Scenes.WizardScene(
  'SUPPORT_WIZARD',
  async (ctx) => {
    const typeKey = ctx.scene.session.state.typeKey;
    const issueLabel = ISSUE_TYPES[typeKey] || 'Outro';
    
    await ctx.replyWithHTML(
      `📑 <b>Abrindo Ticket:</b> ${issueLabel}\n\n` +
      `Descreva o problema detalhadamente ( prints ou textos técnicos ajudam muito ):\n\n` +
      `<i>Para cancelar, envie /cancel</i>`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_ticket')]])
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_ticket') {
        await ctx.answerCbQuery('Ticket cancelado.');
        return ctx.scene.leave();
      }
      return ctx.reply('❌ Por favor, descreva o problema em texto.');
    }

    const message = ctx.message.text.trim();
    if (message === '/cancel' || message === '/start') {
      await ctx.reply('❌ Operação cancelada.');
      return ctx.scene.leave();
    }

    const typeKey = ctx.scene.session.state.typeKey;
    const telegramId = BigInt(ctx.from.id);
    
    try {
      const user = await prisma.user.findUnique({ where: { telegramId } });
      
      // Save to Database
      const ticket = await prisma.supportTicket.create({
        data: {
          userId: user.id,
          category: typeKey,
          message: message
        }
      });

      // Notify Admin
      if (ADMIN_ID) {
        const adminText = `🚨 <b>NOVO TICKET DE SUPORTE</b>\n\n` +
          `👤 <b>Player:</b> ${ctx.from.first_name} (@${ctx.from.username || 'N/A'})\n` +
          `🏷️ <b>Categoria:</b> ${ISSUE_TYPES[typeKey]}\n` +
          `🆔 <b>Ticket ID:</b> <code>${ticket.id}</code>\n\n` +
          `📝 <b>Relato:</b>\n<i>${message}</i>`;
        
        await ctx.telegram.sendMessage(ADMIN_ID, adminText, { parse_mode: 'HTML' }).catch(e => logger.error('[Support] Admin notification failed:', e));
      }

      await ctx.replyWithHTML(
        `✅ <b>Ticket Enviado com Sucesso!</b>\n\n` +
        `ID: <code>${ticket.id}</code>\n` +
        `Analisaremos os registros do sistema referentes à sua atividade nas últimas horas. Não é necessário enviar novamente.`,
        Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]])
      );

      return ctx.scene.leave();
    } catch (error) {
      logger.error('[Support] Wizard failure:', error);
      await ctx.reply('❌ Falha interna ao registrar ticket. Tente novamente mais tarde.');
      return ctx.scene.leave();
    }
  }
);

module.exports = {
  supportPanelHandler,
  supportWizard
};
