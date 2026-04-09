const { Markup, Scenes } = require('telegraf');
const prisma = require('../../config/prisma');
const { isAddress } = require('ethers');
const priceService = require('../../services/priceService');
const levelingService = require('../../services/levelingService');

/**
 * Main Referral Dashboard for Users
 */
async function referralPanelHandler(ctx) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
  }
  const telegramId = BigInt(ctx.from.id);

  if (!user.referralCode) {
    return ctx.reply('❌ Seu código de indicação ainda não foi gerado. Digite /start para atualizar.');
  }

  const botUsername = ctx.botInfo.username;
  const referralLink = `https://t.me/${botUsername}?start=r_${user.referralCode}`;
  const totalReferred = user.referrals.length;
  const payoutDisplay = user.referralPayoutAddress 
    ? `<code>${user.referralPayoutAddress.slice(0, 8)}...${user.referralPayoutAddress.slice(-6)}</code>` 
    : '❌ <i>Não Configurado</i>';
  
  // Calculate estimated USD value
  const priceBCOIN = await priceService.getTokenPrice('BSC', 'BCOIN').catch(() => 0);
  const priceSEN = await priceService.getTokenPrice('BSC', 'SEN').catch(() => 0);
  
  const totalUSD = user.referralBalanceUSDT + 
                  (user.referralBalanceBCOIN * priceBCOIN) + 
                  (user.referralBalanceSEN * priceSEN);

  // RPG Progression Display
  const nextLevel = levelingService.getNextLevelInfo(user.level);
  const progressText = nextLevel 
    ? generateProgressBar(user.xp, nextLevel.xpThreshold)
    : '<code>[MAX LEVEL REACHED]</code>';

  const text = `🎁 <b>MULTIPLAYER: PLAYER 2 & REWARDS</b>\n\n` +
    `👾 <b>Seu Status:</b> Level <code>${user.level}</code>\n` +
    `💰 <b>Sua Comissão:</b> <code>${(user.commissionRate * 100).toFixed(1)}%</code>\n` +
    `📈 <b>Progresso de XP:</b>\n${progressText}\n\n` +
    `Ganhe bônus sobre todas as Energy Packs e Passes adquiridos pelos seus recrutas!\n\n` +
    `📊 <b>Seu Baú de Ganhos:</b>\n` +
    `│ 👥 <b>Recrutados:</b> <code>${totalReferred}</code>\n` +
    `│ 💵 <b>Loot Total (Estimado):</b> <code>$${totalUSD.toFixed(2)} USD</code>\n\n` +
    `⚡ <b>RECOMPENSAS INSTANTÂNEAS</b>\n` +
    `Gemas enviadas direto para o cofre externo via Split On-Chain.\n` +
    `│ 🏦 <b>Cofre Alvo:</b> ${payoutDisplay}\n\n` +
    `🔗 <b>Link de Convite (Spawn Point):</b>\n` +
    `<code>${referralLink}</code>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📜 Histórico de Loot', 'view_loot_history')],
    [Markup.button.callback('🏦 Configurar Cofre de Payout', 'setup_referral_payout')],
    [Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }
  return ctx.replyWithHTML(text, keyboard);
}

function generateProgressBar(current, target) {
  const percent = Math.min(Math.floor((current / target) * 100), 100);
  const size = 10;
  const filled = Math.floor((percent / 100) * size);
  const empty = size - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `<code>[${bar}]</code> ${percent}% (${current.toFixed(1)}/${target} XP)`;
}

/**
 * Shows the last 5 commission logs
 */
async function showLootHistoryHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  
  const logs = await prisma.commissionLog.findMany({
    where: { referrerId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  let text = `📜 <b>HISTÓRICO DE LOOT RECENTE</b>\n\n`;

  if (logs.length === 0) {
    text += `<i>Nenhuma recompensa recebida ainda. Comece a recrutar players!</i>`;
  } else {
    for (const log of logs) {
      const date = log.createdAt.toLocaleDateString('pt-BR');
      text += `📅 ${date} | 💰 +$${log.commission.toFixed(2)} ${log.asset}\n` +
              `🔗 <a href="https://polygonscan.com/tx/${log.txHash}">Ver Transação</a>\n` +
              `────────────────────\n`;
    }
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Voltar', 'referral_panel')]
  ]);

  return ctx.editMessageText(text, { parse_mode: 'HTML', disable_web_page_preview: true, ...keyboard });
}

/**
 * Scene for setting up the external payout address
 */
const setupPayoutAddressScene = new Scenes.BaseScene('SETUP_PAYOUT_ADDRESS');

setupPayoutAddressScene.enter((ctx) => {
  const text = `🛡️ <b>CONFIGURAÇÃO DE RECOMPENSAS</b>\n\n` +
    `Você receberá suas gemas <b>exatamente na mesma infraestrutura</b> (Rede e Ativo) que seu recruta utilizar.\n\n` +
    `Cadastre um <b>Cofre Externo (MetaMask, TrustWallet)</b> que consiga receber tokens <u>tanto da rede Polygon quanto da BSC</u> no mesmo endereço.\n\n` +
    `⚠️ <b>AVISO DO BOSS:</b> Não utilize a carteira interna do bot para acumular seu lucro global.\n\n` +
    `Envie no chat agora o seu <b>Endereço Seguro</b> (começando com 0x...):`;
    
  ctx.replyWithHTML(text, Markup.inlineKeyboard([Markup.button.callback('❌ Cancelar', 'cancel_scene')]));
});

setupPayoutAddressScene.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // ESCAPE HATCH
  if (text === '/cancel' || text === '/start') {
    await ctx.reply('❌ Operação cancelada.');
    return ctx.scene.leave();
  }

  if (!isAddress(text)) {
    return ctx.reply('❌ Formato de endereço inválido. Certifique-se de que é um endereço Ethereum/BSC/Polygon válido (começa com 0x). Envie novamente ou digite /cancel.');
  }

  const address = text;

  const telegramId = BigInt(ctx.from.id);
  await prisma.user.update({
    where: { telegramId },
    data: { referralPayoutAddress: address }
  });

  await ctx.reply('✅ Carteira de pagamento configurada com sucesso! As suas comissões de indicação serão contabilizadas e processadas para este endereço de forma segura.');
  await ctx.scene.leave();
  
  // Call the panel again
  return referralPanelHandler(ctx);
});

setupPayoutAddressScene.action('cancel_scene', async (ctx) => {
  await ctx.scene.leave();
  return referralPanelHandler(ctx);
});

module.exports = {
  referralPanelHandler,
  showLootHistoryHandler,
  setupPayoutAddressScene
};
