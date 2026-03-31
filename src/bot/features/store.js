const { Markup } = require('telegraf');
const prisma = require('../../config/prisma');
const config = require('../../config');
const priceService = require('../../services/priceService');
const paymentService = require('../../services/paymentService');
const balanceService = require('../../services/balanceService');

const PACKAGES = [
  { id: 'p1', name: '🔋 1.000 Trades', price: 10, credits: 1000 },
  { id: 'p2', name: '🔋 5.000 Trades', price: 40, credits: 5000 },
  { id: 'mrr', name: '💎 Assinatura Mensal (Ilimitado)', price: 29, credits: 0, isSubscription: true }
];

async function storePanelHandler(ctx) {
  const text = '🔋 <b>Loja Auto-Trader</b>\nRecarregue sua bateria para continuar operando sem interrupções.\n\nEscolha um pacote:';
  
  const buttons = PACKAGES.map(p => ([
    Markup.button.callback(`${p.name} - $${p.price}`, `buy_package_${p.id}`)
  ]));
  
  buttons.push([Markup.button.callback('💳 Pagar com PIX/Cartão', 'onramp_flow')]);
  buttons.push([Markup.button.callback('⬅️ Voltar', 'start_panel')]);

  const keyboard = Markup.inlineKeyboard(buttons);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }

  return ctx.replyWithHTML(text, keyboard);
}

/**
 * Step 2: Select Network
 */
async function selectNetworkHandler(ctx, packageId) {
  const text = `🌐 <b>Escolha a rede para o pagamento:</b>\nVocê pode pagar usando qualquer uma das redes abaixo:`;
  
  const buttons = [
    [Markup.button.callback('🟣 Polygon (MATIC)', `select_asset_${packageId}_POLYGON`)],
    [Markup.button.callback('🟡 Binance Smart Chain (BSC)', `select_asset_${packageId}_BSC`)],
    [Markup.button.callback('⬅️ Voltar', 'store_panel')]
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

/**
 * Step 3: Select Asset (Token)
 */
async function selectAssetHandler(ctx, packageId, network) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { wallet: true } });
  
  if (!user.wallet) return ctx.answerCbQuery('❌ Configure uma carteira primeiro!', { show_alert: true });

  const text = `💳 <b>Escolha a moeda de pagamento:</b>\nRede Selecionada: <b>${network}</b>`;
  
  const buttons = [
    [Markup.button.callback('💎 USDT', `confirm_checkout_${packageId}_${network}_USDT`)],
    [Markup.button.callback('💎 BCOIN (Auto-Converter)', `confirm_checkout_${packageId}_${network}_BCOIN`)],
    [Markup.button.callback('💎 SEN (Auto-Converter)', `confirm_checkout_${packageId}_${network}_SEN`)],
    [Markup.button.callback('⬅️ Voltar', `buy_package_${packageId}`)]
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

/**
 * Step 4: Final Confirmation
 */
async function confirmCheckoutHandler(ctx, packageId, network, assetName) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { wallet: true } });
  const pkg = PACKAGES.find(p => p.id === packageId);

  await ctx.editMessageText(`⌛ <b>Calculando preço...</b>`, { parse_mode: 'HTML' });

  try {
    const price = await priceService.getTokenPrice(network, assetName);
    const amountToPay = (pkg.price / price).toFixed(4);

    // Save quote to session
    ctx.session.lastQuote = {
      price,
      amount: amountToPay,
      timestamp: Date.now(),
      packageId,
      assetName,
      network
    };

    const text = `💳 <b>Confirmação de Pagamento</b>\n\n` +
      `📦 <b>Pacote:</b> ${pkg.name}\n` +
      `🌐 <b>Rede:</b> <code>${network}</code>\n` +
      `💵 <b>Valor USD:</b> $${pkg.price}.00\n` +
      `💎 <b>Preço Unitário:</b> $${price.toFixed(6)}\n\n` +
      `🔥 <b>Total a Pagar:</b> ${amountToPay} ${assetName}\n\n` +
      `⚠️ <i>Esta cotação é válida por 60 segundos.</i>`;

    const buttons = [
      [Markup.button.callback('✅ Confirmar e Pagar', `execute_payment_${packageId}_${network}_${assetName}_${amountToPay}`)],
      [Markup.button.callback('⬅️ Cancelar', `select_asset_${packageId}_${network}`)]
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } catch (error) {
    return ctx.replyWithHTML(`❌ <b>Erro:</b> ${error.message}`);
  }
}

/**
 * Step 5: Execute
 */
async function executePaymentHandler(ctx, packageId, network, assetName, amountToPay) {
  if (ctx.session.isProcessingPayment) {
    return ctx.answerCbQuery('⏳ Já existe um pagamento em processamento...', { show_alert: true });
  }

  const lastQuote = ctx.session.lastQuote;
  if (!lastQuote || lastQuote.packageId !== packageId || lastQuote.assetName !== assetName || lastQuote.network !== network) {
    return ctx.reply('❌ Dados da cotação expirados ou inválidos. Por favor, reinicie o processo.');
  }

  const age = (Date.now() - lastQuote.timestamp) / 1000;
  if (age > 60) {
    await ctx.answerCbQuery('⚠️ Cotação expirada. Recalculando...', { show_alert: true });
    return confirmCheckoutHandler(ctx, packageId, network, assetName);
  }

  ctx.session.isProcessingPayment = true;

  try {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ where: { telegramId }, include: { wallet: true } });
    const pkg = PACKAGES.find(p => p.id === packageId);

    await ctx.editMessageText(`⌛ <b>Processando Pagamento...</b>\nRede: <b>${network}</b>\nTransação: <b>${amountToPay} ${assetName}</b>\n\nPor favor, aguarde a confirmação na blockchain.`, { parse_mode: 'HTML' });

    const netKey = network.toLowerCase();
    const tokenInfo = config.networks[netKey].tokens.find(t => t.symbol === assetName);
    const tokenAddress = assetName === 'USDT' ? config.networks[netKey].usdt : tokenInfo?.address;
    
    // Check balance on the ACTUAL SELECTED network
    const balances = await balanceService.checkBalances(user.wallet.publicAddress, network, tokenAddress);
    if (balances.tokenBalance < parseFloat(amountToPay)) {
      throw new Error(`Saldo insuficiente na rede ${network} (${balances.tokenBalance} ${assetName}).`);
    }

    // Determine if we can do an instant referral split
    let referralAddress = null;
    let referralAmount = null;

    if (user.referredById) {
      const referrer = await prisma.user.findUnique({ where: { id: user.referredById } });
      if (referrer && referrer.referralPayoutAddress) {
        // Calculate 10% commission
        referralAmount = (parseFloat(amountToPay) * 0.10).toFixed(6);
        referralAddress = referrer.referralPayoutAddress;
      }
    }

    // Process checkout uses the network provided from the flow. It now handles the split instantly if provided.
    const txHash = await paymentService.processCheckout(
      user.id, 
      'TOKEN', 
      amountToPay, 
      tokenAddress, 
      network,
      referralAddress,
      referralAmount
    );

    if (pkg.isSubscription) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      await prisma.user.update({ where: { id: user.id }, data: { subscriptionExpiresAt: expiry } });
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: pkg.credits } } });
    }

    // Update Lifetime Earnings (Statistical)
    if (user.referredById && referralAddress && referralAmount) {
      try {
        const assetField = `referralBalance${assetName}`; // USDT, BCOIN, or SEN
        await prisma.user.update({
          where: { id: user.referredById },
          data: { [assetField]: { increment: parseFloat(referralAmount) } }
        });
        console.log(`[Referral] Instant payout successful. Credited lifetime stats: ${referralAmount} ${assetName} for referrer ${user.referredById}`);
      } catch (refError) {
        console.error(`[Referral] Failed to update lifetime stats:`, refError);
      }
    }

    await ctx.replyWithHTML(`🎉 <b>Pagamento Confirmado!</b>\nBateria recarregada via ${network}.\n\nTx: <code>${txHash}</code>`, 
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar à Loja', 'store_panel')]]));
  } catch (error) {
    await ctx.replyWithHTML(`❌ <b>Erro no Pagamento (${network}):</b> ${error.message}\nVerifique seu saldo de gás e tokens na rede escolhida.`, 
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Tentar Novamente', 'store_panel')]]));
  } finally {
    ctx.session.isProcessingPayment = false;
    delete ctx.session.lastQuote;
  }
}

async function onrampFlowHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { wallet: true } });
  
  const text = `💳 <b>Compra de Criptomoedas (PIX/Cartão)</b>\n\n` +
    `O bot <u>não possui</u> custódia do seu dinheiro. O abastecimento da sua carteira deve ser feito por <b>sua conta</b> em plataformas externas reconhecidas.\n\n` +
    `1️⃣ <b>Copie seu endereço abaixo:</b>\n` +
    `<code>${user.wallet?.publicAddress || '⚠️ Gere uma carteira primeiro'}</code>\n\n` +
    `2️⃣ <b>Acesse um local confiável para comprar:</b>\n` +
    `Recomendamos usar o sistema <b>P2P ou Compre Cripto</b> das seguintes corretoras:\n\n` +
    `• <b>Binance:</b> Maior do mundo, aceita PIX.\n` +
    `• <b>Bybit:</b> Ótima liquidez e taxas baixas.\n` +
    `• <b>OKX:</b> Interface simples e segura.\n\n` +
    `<i>Após comprar, envie os ativos para o endereço que você copiou acima.</i>`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('🟡 Comprar na Binance (PIX)', 'https://p2p.binance.com/pt-BR')],
    [Markup.button.url('🟠 Comprar na Bybit', 'https://www.bybit.com/fiat/trade/otc')],
    [Markup.button.url('🔵 Comprar na OKX', 'https://www.okx.com/buy-crypto')],
    [Markup.button.callback('⬅️ Voltar à Loja', 'store_panel')]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }

  return ctx.replyWithHTML(text, keyboard);
}

module.exports = {
  storePanelHandler,
  selectNetworkHandler,
  selectAssetHandler,
  confirmCheckoutHandler,
  executePaymentHandler,
  onrampFlowHandler
};
