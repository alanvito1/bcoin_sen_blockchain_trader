const { Markup } = require('telegraf');
const prisma = require('../../config/prisma');
const { tradeQueue } = require('../../config/queue');
const AdminService = require('../../services/adminService');
const { adminStatusHandler } = require('./adminStatus');
const { getOrCreateTransitWallet, revealTransitWallet } = require('../../services/walletService');
const encryption = require('../../utils/encryption');
const { Wallet } = require('ethers');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

async function adminHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  try {
    const [userCount, activeUsers, trades24h] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.tradeHistory.count({ 
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } 
      })
    ]);

    // Simple Revenue estimation (credits * fixed rate)
    const totalCredits = await prisma.user.aggregate({ _sum: { credits: true } });
    const jobCount = await tradeQueue.getWaitingCount();

    const text = `📊 <b>PROJETOS: BLOCKCHAIN TRADER - ADMIN</b>\n\n` +
      `👥 <b>Usuários:</b>\n- Total: ${userCount}\n- Ativos: ${activeUsers}\n\n` +
      `📈 <b>Atividade (24h):</b>\n- Trades: ${trades24h}\n\n` +
      `🔋 <b>Economia:</b>\n- Créditos em Circulação: ${totalCredits._sum.credits || 0}\n\n` +
      `⚙️ <b>Fila BullMQ:</b>\n- Aguardando: ${jobCount} jobs`;

    return ctx.replyWithHTML(text, Markup.inlineKeyboard([
      [Markup.button.callback('📢 Broadcast', 'broadcast_prompt'), Markup.button.callback('🛠️ Ferramentas', 'admin_tools')],
      [Markup.button.callback('💰 Ver Financeiro (Caixa)', 'admin_status')],
      [Markup.button.callback('🔙 Voltar', 'start_panel')]
    ]));

  } catch (error) {
    console.error('[Admin] Error:', error);
    return ctx.reply('❌ Erro ao buscar métricas.');
  }
}

async function rotateTransitWalletHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  await ctx.reply('⏳ Gerando nova carteira de transição e atualizando segredos...');

  try {
    const newWallet = Wallet.createRandom();
    const encrypted = encryption.encrypt(newWallet.privateKey);

    await prisma.systemSecret.upsert({
      where: { key: 'TRANSIT_WALLET' },
      update: {
        encryptedValue: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag
      },
      create: {
        key: 'TRANSIT_WALLET',
        encryptedValue: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag
      }
    });

    return ctx.replyWithHTML(
      `✅ <b>Carteira de Transição Rotacionada!</b>\n\n` +
      `Novo Endereço: <code>${newWallet.address}</code>\n` +
      `A carteira anterior foi invalidada para novos recebimentos.`
    );
  } catch (error) {
    return ctx.reply(`❌ Erro ao rotacionar: ${error.message}`);
  }
}

async function revealTransitWalletHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  try {
    const pk = await revealTransitWallet();
    if (!pk) return ctx.reply('⚠️ Nenhuma carteira de transição encontrada.');

    const wallet = new Wallet(pk);
    const text = 
      `🚨 <b>CHAVE PRIVADA - TRANSIT WALLET</b>\n` +
      `Use APENAS para resgate manual de emergência.\n\n` +
      `Endereço: <code>${wallet.address}</code>\n` +
      `Chave Privada: <code>${pk}</code>\n\n` +
      `<b>AVISO:</b> APAGUE ESTA MENSAGEM APÓS O USO.`;

    return ctx.replyWithHTML(text);
  } catch (error) {
    return ctx.reply(`❌ Erro ao revelar: ${error.message}`);
  }
}

async function broadcastHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  const message = ctx.message.text.split('/broadcast ')[1];
  if (!message) return ctx.reply('⚠️ Use: /broadcast Sua mensagem aqui');

  const users = await prisma.user.findMany({ where: { isActive: true } });
  let success = 0;

  ctx.reply(`🚀 Iniciando broadcast para ${users.length} usuários...`);

  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.telegramId.toString(), `📢 <b>MENSAGEM DO SISTEMA</b>\n\n${message}`, { parse_mode: 'HTML' });
      success++;
    } catch (e) {
      console.error(`[Broadcast] Failed for ${user.telegramId}`);
    }
  }

  return ctx.reply(`✅ Broadcast finalizado. Enviado com sucesso para ${success}/${users.length} usuários.`);
}

async function adminToolsHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  const text = `🛠️ <b>FERRAMENTAS DE MANUTENÇÃO</b>\n` +
    `Escolha uma operação avançada:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔓 Limpar Fila Polygon (Stuck)', 'admin_clear_stuck_polygon')],
    [Markup.button.callback('🔓 Limpar Fila BSC (Stuck)', 'admin_clear_stuck_bsc')],
    [Markup.button.callback('🏥 Check-up Banco de Dados', 'admin_db_health')],
    [Markup.button.callback('🔙 Voltar ao Admin', 'admin_panel')]
  ]);

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
}

async function clearStuckHandler(ctx, network) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  await ctx.answerCbQuery(`⌛ Limpando fila ${network}...`);
  
  try {
    const result = await AdminService.clearMasterStuckTransactions(network);
    
    if (result.status === 'CLEAN') {
      return ctx.reply(`✅ <b>Limpeza Concluída:</b> ${result.message}`, { parse_mode: 'HTML' });
    }

    const text = `🚀 <b>Transação de Cancelamento Enviada!</b>\n` +
      `- Rede: ${network}\n` +
      `- Transações Travadas: ${result.diff}\n` +
      `- Hash: <code>${result.txHash}</code>\n\n` +
      `<a href="${result.link}">Clique aqui para acompanhar no Explorer</a>`;

    return ctx.replyWithHTML(text);
  } catch (err) {
    return ctx.reply(`❌ <b>Erro na Limpeza:</b> ${err.message}`, { parse_mode: 'HTML' });
  }
}

async function dbHealthHandler(ctx) {
  if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;

  try {
    const health = await AdminService.getDatabaseHealth();
    
    const text = `🏥 <b>RELATÓRIO DE SAÚDE DO DB</b>\n\n` +
      `👥 <b>Usuários:</b> ${health.users}\n` +
      `💳 <b>Carteiras:</b> ${health.wallets}\n` +
      `📈 <b>Total Trades:</b> ${health.trades}\n\n` +
      `📋 <b>Últimos 5 Trades:</b>\n` +
      health.lastTrades.map(t => `- [${t.createdAt.toISOString().split('T')[0]}] ${t.type} -> ${t.status}`).join('\n');

    return ctx.replyWithHTML(text);
  } catch (err) {
    return ctx.reply(`❌ <b>Erro ao verificar saúde:</b> ${err.message}`, { parse_mode: 'HTML' });
  }
}

module.exports = {
  adminHandler,
  broadcastHandler,
  adminToolsHandler,
  clearStuckHandler,
  adminStatusHandler,
  dbHealthHandler,
  rotateTransitWalletHandler,
  revealTransitWalletHandler
};
