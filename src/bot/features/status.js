'use strict';

const { Markup } = require('telegraf');
const prisma = require('../../config/prisma');
const { tradeQueue } = require('../../config/queue');
const logger = require('../../utils/logger');
const os = require('os');

/**
 * Main Status Dashboard for Users
 */
async function statusHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const isAdmin = String(ctx.from.id) === String(process.env.ADMIN_TELEGRAM_ID);

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { 
        tradeConfigs: { where: { isOperating: true } },
        _count: { select: { tradeHistory: true } }
      }
    });

    if (!user) return ctx.reply('❌ Usuário não encontrado.');

    // User Statistics
    const activeEngines = user.tradeConfigs.length;
    const totalTrades = user._count.tradeHistory;
    const creditsDisplay = user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()
      ? '💎 <b>VIP Ilimitado</b>'
      : `🔋 <b>${user.credits.toLocaleString()}</b> Trades`;

    // Last 3 user trades
    const lastTrades = await prisma.tradeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 3
    });

    let text = `📊 <b>DASHBOARD DE STATUS</b>\n\n` +
      `👤 <b>Sua Conta:</b>\n` +
      `│ 🔋 <b>Bateria:</b> ${creditsDisplay}\n` +
      `│ 🤖 <b>Motores Ativos:</b> <code>${activeEngines}</code>\n` +
      `│ 📈 <b>Total Operações:</b> <code>${totalTrades}</code>\n\n`;

    if (lastTrades.length > 0) {
      text += `🕒 <b>Últimas Atividades:</b>\n`;
      text += lastTrades.map(t => {
        const icon = t.status === 'SUCCESS' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
        return `│ ${icon} ${t.type} (${t.createdAt.toLocaleTimeString('pt-BR')}) - ${t.status}`;
      }).join('\n') + `\n\n`;
    }

    // Admin-only System Stats
    if (isAdmin) {
      const dbOnline = await prisma.$queryRaw`SELECT 1`.then(() => '🟢 Online').catch(() => '🔴 Offline');
      const queueJobs = await tradeQueue.getWaitingCount();
      const uptimeH = Math.floor(os.uptime() / 3600);
      const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
      
      text += `🖥️ <b>SISTEMA (ADMIN)</b>\n` +
        `│ 🗄️ <b>Prisma DB:</b> ${dbOnline}\n` +
        `│ ⚙️ <b>Queue BullMQ:</b> <code>${queueJobs} jobs</code>\n` +
        `│ ⏳ <b>Uptime VPS:</b> <code>${uptimeH}h</code>\n` +
        `│ 🧠 <b>Memória Livre:</b> <code>${freeMem} GB</code>\n`;
    }

    const buttons = [
      [Markup.button.callback('🔄 Atualizar', 'status_panel')],
      [Markup.button.callback('📜 Ver Histórico Completo', 'view_history')],
      [Markup.button.callback('⬅️ Voltar', 'start_panel')]
    ];

    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }
    return ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));

  } catch (error) {
    logger.error('[Status] Error in statusHandler:', error);
    return ctx.reply('❌ Erro ao carregar status do sistema.');
  }
}

/**
 * Simple history view (Phase 6.2)
 */
async function historyHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  
  try {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    const trades = await prisma.tradeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (trades.length === 0) {
      return ctx.answerCbQuery('⚠️ Você ainda não possui trades registrados.');
    }

    let text = `📜 <b>HISTÓRICO RECENTE (10 ÚLTIMOS)</b>\n\n`;
    text += trades.map(t => {
      const date = t.createdAt.toLocaleDateString('pt-BR');
      const time = t.createdAt.toLocaleTimeString('pt-BR');
      const icon = t.status === 'SUCCESS' ? '✅' : '❌';
      return `${icon} <b>${t.type}</b> - ${date} ${time} - ${t.status}\n` +
             `└ <code>${t.txHash?.slice(0, 16) || 'N/A'}...</code>\n`;
    }).join('\n');

    const buttons = [[Markup.button.callback('⬅️ Voltar ao Status', 'status_panel')]];
    
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } catch (error) {
    logger.error('[Status] Error in historyHandler:', error);
    return ctx.answerCbQuery('❌ Erro ao carregar histórico.');
  }
}

module.exports = {
  statusHandler,
  historyHandler
};
