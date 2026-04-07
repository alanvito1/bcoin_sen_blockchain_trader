const { Markup } = require('telegraf');
const prisma = require('../../config/prisma');
const { TERMS_TEXT } = require('../constants/texts');

/**
 * Handler for /start command
 */
/**
 * Handler for /start command or start_panel action
 */
async function startHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const firstName = ctx.from.first_name || 'Comandante';
  const username = ctx.from.username || 'DeFi-Trader';

  // 1. Check for Referral Payload
  const startPayload = ctx.startPayload;
  let referrerUser = null;
  if (startPayload && startPayload.startsWith('r_')) {
    const refCode = startPayload.replace('r_', '');
    referrerUser = await prisma.user.findUnique({ where: { referralCode: refCode } });
  }

  // 1b. Multi-step create to handle referral logic for NEW users only
  let user = await prisma.user.findUnique({ where: { telegramId } });
  
  if (!user) {
    // Generate unique referral code for the NEW user
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newRefCode = (username || firstName).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) + randomSuffix;

    user = await prisma.user.create({
      data: { 
        telegramId, 
        username,
        referralCode: newRefCode,
        referredById: referrerUser ? referrerUser.id : null
      }
    });

    if (referrerUser) {
      console.log(`[Referral] User ${telegramId} referred by ${referrerUser.username}`);
    }
  } else {
    // Existing user: Update username and ensure they have a referral code if they are legacy
    const updateData = { username, isActive: true };
    if (!user.referralCode) {
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      updateData.referralCode = (username || firstName).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) + randomSuffix;
    }
    user = await prisma.user.update({
      where: { telegramId },
      data: updateData
    });
  }

  // --- TERMS GATE ---
  if (!user.hasAcceptedTerms) {
    const termsKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ ACEITAR E JOGAR', 'accept_terms')],
      [Markup.button.callback('❌ DESISTIR', 'refuse_terms')]
    ]);

    if (ctx.callbackQuery) {
      return ctx.editMessageText(TERMS_TEXT, { parse_mode: 'HTML', ...termsKeyboard });
    }
    return ctx.replyWithHTML(TERMS_TEXT, termsKeyboard);
  }

  // 2. Fetch Detailed Info
  const userFull = await prisma.user.findUnique({
    where: { id: user.id },
    include: { wallet: true, tradeConfigs: true }
  });

  const wallet = userFull.wallet;
  const walletDisplay = wallet 
    ? `<code>${wallet.publicAddress.slice(0, 8)}...${wallet.publicAddress.slice(-6)}</code>`
    : '❌ <i>Não Vinculada</i>';

  const creditsDisplay = userFull.subscriptionExpiresAt && userFull.subscriptionExpiresAt > new Date()
    ? '💎 <b>ILIMITADO (VIP)</b>'
    : `🔋 <code>${userFull.credits.toLocaleString()}</code> Trades`;

  // Helper to get engine status line
  const getEngineLine = (network, token) => {
    const cfg = userFull.tradeConfigs.find(c => c.network === network && c.tokenPair.startsWith(token));
    const label = `${network.slice(0, 3)} ${token}`.padEnd(8, ' ');
    if (!cfg) return `│ ⚪ <code>${label}</code> : <i>Desativado</i>`;
    const status = cfg.isOperating ? '🟢' : '🔴';
    return `│ ${status} <code>${label}</code> : C:${cfg.buyAmountA} / V:${cfg.sellAmountA}`;
  };

  const welcomeText = `👾 <b>BOMBER TRADER: STAGE 1</b> 🕹️\n` +
    `Status: <b>BATTLE READY</b> | Player: <code>${firstName}</code>\n\n` +
    `┌── <b>[ STATUS DO PLAYER ]</b>\n` +
    `│ 🎒 <b>Inventário:</b> ${walletDisplay}\n` +
    `│ 🔋 <b>Energy:</b> ${creditsDisplay}\n` +
    `└── 📡 <b>Server:</b> <code>Polygon / BSC (Mainnet)</code>\n\n` +
    `┌── <b>[ MOTORES DE EXPLOSÃO ]</b>\n` +
    `${getEngineLine('BSC', 'BCOIN')}\n` +
    `${getEngineLine('BSC', 'SEN')}\n` +
    `│\n` +
    `${getEngineLine('POLYGON', 'BCOIN')}\n` +
    `${getEngineLine('POLYGON', 'SEN')}\n` +
    `└── ⚙️ <i>Ajuste seu "Firepower" no painel abaixo:</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🕹️ Arena de Trade (Bombas)', 'trade_panel'), Markup.button.callback('🎒 Meu Inventário', 'wallet_panel')],
    [Markup.button.callback('🏪 Item Shop', 'store_panel'), Markup.button.callback('🛠️ Power-ups', 'tools_panel')],
    [Markup.button.callback('🎁 Multiplayer (Convite)', 'referral_panel')],
    [Markup.button.callback('📖 Manual do Jogo', 'quick_guide'), Markup.button.callback('🛠️ Suporte Técnico', 'support_link')]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(welcomeText, { parse_mode: 'HTML', ...keyboard });
  }

  return ctx.replyWithHTML(welcomeText, keyboard);
}




module.exports = startHandler;
