const { Markup } = require('telegraf');
const prisma = require('../../config/prisma');
const config = require('../../config');
const { providers } = require('../../services/blockchain');
const { Contract, formatUnits } = require('ethers');

const ERC20_ABI = ["function balanceOf(address account) view returns (uint256)"];

/**
 * Admin Status Dashboard
 * Only accessible by the owner (TELEGRAM_CHAT_ID)
 */
async function adminStatusHandler(ctx) {
  const telegramId = ctx.from.id.toString();
  const ownerId = process.env.ADMIN_TELEGRAM_ID;

  if (telegramId !== ownerId?.toString()) {
    return ctx.reply('⛔ Acesso Negado. Este comando é exclusivo para o administrador.');
  }

  const adminAddress = process.env.ADMIN_MASTER_WALLET;
  if (!adminAddress) return ctx.reply('❌ ADMIN_MASTER_WALLET não configurada no .env');

  await ctx.reply('📊 <b>Carregando dados financeiros do caixa...</b>', { parse_mode: 'HTML' });

  try {
    // 1. Get Admin Wallet Balances
    const balances = await getAdminBalances(adminAddress);

    // 2. Get Statistics from Database
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    
    // 3. Calculate Total Referral Debt

    const aggregates = await prisma.user.aggregate({
      _sum: {
        referralBalanceUSDT: true,
        referralBalanceBCOIN: true,
        referralBalanceSEN: true
      }
    });

    const totalDebtUSDT = aggregates._sum.referralBalanceUSDT || 0;
    const totalDebtBCOIN = aggregates._sum.referralBalanceBCOIN || 0;
    const totalDebtSEN = aggregates._sum.referralBalanceSEN || 0;

    const text = `🛠️ <b>PAINEL ADMINISTRATIVO (CAIXA)</b>\n\n` +
      `👤 <b>Usuários:</b> <code>${totalUsers}</code> (${activeUsers} ativos)\n` +
      `🏦 <b>Carteira Mestre:</b> <code>${adminAddress.slice(0,6)}...${adminAddress.slice(-4)}</code>\n\n` +
      `💰 <b>Saldos Reais no Caixa:</b>\n` +
      `│ 🟣 Polygon: <code>${balances.polygon.usdt.toFixed(2)} USDT</code>\n` +
      `│ 🟡 BSC: <code>${balances.bsc.bcoin.toFixed(2)} BCOIN</code>\n` +
      `│ 🟡 BSC: <code>${balances.bsc.sen.toFixed(2)} SEN</code>\n\n` +
      `💸 <b>Total Repassado a Afiliados (Lifetime):</b>\n` +
      `│ <code>${totalDebtUSDT.toFixed(2)} USDT</code>\n` +
      `│ <code>${totalDebtBCOIN.toFixed(2)} BCOIN</code>\n` +
      `│ <code>${totalDebtSEN.toFixed(2)} SEN</code>\n\n` +
      `📈 <b>Lucro Líquido no Caixa:</b>\n` +
      `│ <code>$${balances.totalUSD.toFixed(2)} USD</code>\n\n` +
      `💡 <i>O saldo exibido na Carteira Mestre já é o seu lucro real (90%), pois os 10% dos afiliados são enviados automaticamente na hora da compra.</i>`;

    return ctx.replyWithHTML(text, Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Atualizar', 'admin_status')],
      [Markup.button.callback('⬅️ Voltar', 'start_panel')]
    ]));
  } catch (error) {
    console.error('[AdminStatus] Erro:', error);
    return ctx.reply(`❌ Erro ao gerar relatório: ${error.message}`);
  }
}

async function getAdminBalances(address) {
  const priceService = require('../../services/priceService');
  
  const polyUSDT = new Contract(config.networks.polygon.usdt, ERC20_ABI, providers.polygon);
  
  const bcoinToken = config.networks.bsc.tokens.find(t => t.symbol === 'BCOIN');
  const senToken = config.networks.bsc.tokens.find(t => t.symbol === 'SEN');
  
  if (!bcoinToken || !senToken) {
    throw new Error('Configuração de tokens BCOIN/SEN não encontrada para a rede BSC.');
  }

  const bscBCOIN = new Contract(bcoinToken.address, ERC20_ABI, providers.bsc);
  const bscSEN = new Contract(senToken.address, ERC20_ABI, providers.bsc);

  const [balPolyUSDT, balBscBCOIN, balBscSEN] = await Promise.all([
    polyUSDT.balanceOf(address),
    bscBCOIN.balanceOf(address),
    bscSEN.balanceOf(address)
  ]);

  const pBCOIN = await priceService.getTokenPrice('BSC', 'BCOIN').catch(() => 0);
  const pSEN = await priceService.getTokenPrice('BSC', 'SEN').catch(() => 0);

  const usdtValue = parseFloat(formatUnits(balPolyUSDT, 6));
  const bcoinValue = parseFloat(formatUnits(balBscBCOIN, 18));
  const senValue = parseFloat(formatUnits(balBscSEN, 18));

  return {
    polygon: { usdt: usdtValue },
    bsc: { bcoin: bcoinValue, sen: senValue },
    totalUSD: usdtValue + (bcoinValue * pBCOIN) + (senValue * pSEN),
    priceBCOIN: pBCOIN,
    priceSEN: pSEN
  };
}

module.exports = { adminStatusHandler };
