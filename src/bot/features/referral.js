const { Markup, Scenes } = require('telegraf');
const prisma = require('../../config/prisma');
const { isAddress } = require('ethers');
const priceService = require('../../services/priceService');

/**
 * Main Referral Dashboard for Users
 */
async function referralPanelHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { referrals: true }
  });

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

  const threshold = 10.0; // Payout was previously at $10. Now instant.

  const text = `🎁 <b>INDIQUE E GANHE (10%)</b>\n\n` +
    `Receba <b>10% de Cashback/Comissão</b> sobre todas as cargas de bateria e assinaturas realizadas pelos seus indicados!\n\n` +
    `📈 <b>Seu Histórico de Ganhos Globais:</b>\n` +
    `│ 👥 <b>Indicados:</b> <code>${totalReferred}</code>\n` +
    `│ 💵 <b>Total Recebido (On-Chain):</b>\n` +
    `│   • <code>${user.referralBalanceUSDT.toFixed(2)} USDT</code>\n` +
    `│   • <code>${user.referralBalanceBCOIN.toFixed(2)} BCOIN</code>\n` +
    `│   • <code>${user.referralBalanceSEN.toFixed(2)} SEN</code>\n` +
    `│ 💰 <b>Estimativa Global em USD:</b> <code>$${totalUSD.toFixed(2)} USD</code>\n\n` +
    `⚡ <b>PAGAMENTOS INSTANTÂNEOS</b>\n` +
    `Sua comissão não fica retida no bot! Assim que seu indicado realizar um pagamento, seus 10% vão diretamente para a carteira cadastrada abaixo na mesma hora e na mesma moeda.\n\n` +
    `│ 🏦 <b>Carteira de Recebimento:</b> ${payoutDisplay}\n\n` +
    `🔗 <b>Seu Link de Convite:</b>\n` +
    `<code>${referralLink}</code>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🏦 Configurar Carteira de Recebimento', 'setup_referral_payout')],
    [Markup.button.callback('⬅️ Voltar ao Terminal', 'start_panel')]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }
  return ctx.replyWithHTML(text, keyboard);
}

/**
 * Scene for setting up the external payout address
 */
const setupPayoutAddressScene = new Scenes.BaseScene('SETUP_PAYOUT_ADDRESS');

setupPayoutAddressScene.enter((ctx) => {
  const text = `🛡️ <b>CONFIGURAÇÃO DE RECEBIMENTO</b>\n\n` +
    `Você receberá suas comissões <b>exatamente na mesma moeda e rede</b> em que seu indicado realizar a compra (Ex: se ele pagar em USDT na Polygon, você receberá USDT na Polygon; se pagar BCOIN na BSC, você recebe BCOIN na BSC).\n\n` +
    `Por isso, solicite ou cadastre um <b>Endereço Externo (MetaMask, TrustWallet)</b> que consiga receber tokens <u>tanto da rede Polygon quanto da BSC</u> no mesmo endereço.\n\n` +
    `⚠️ <b>ATENÇÃO:</b> Não utilize a carteira (Burn Wallet) gerada internamente pelo bot para receber lucros a longo prazo.\n\n` +
    `Envie no chat agora o seu <b>Endereço (começando com 0x...)</b> seguro:`;
    
  ctx.replyWithHTML(text, Markup.inlineKeyboard([Markup.button.callback('❌ Cancelar', 'cancel_scene')]));
});

setupPayoutAddressScene.on('text', async (ctx) => {
  const address = ctx.message.text.trim();
  
  if (!isAddress(address)) {
    return ctx.reply('❌ Formato de endereço inválido. Certifique-se de que é um endereço Ethereum/BSC/Polygon válido (começa com 0x). Envie novamente ou digite /cancel.');
  }

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
  setupPayoutAddressScene
};
