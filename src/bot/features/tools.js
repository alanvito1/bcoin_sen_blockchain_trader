const { Markup } = require('telegraf');
const { providers } = require('../../services/blockchain');
const priceService = require('../../services/priceService');
const { formatUnits } = require('ethers');

/**
 * Main Tools Dashboard for Users
 */
async function toolsPanelHandler(ctx) {
  const text = `🛠️ <b>CENTRAL DE FERRAMENTAS</b>\n\n` +
    `Escolha um utilitário para sua jornada DeFi:\n\n` +
    `• ⛽ <b>Gas Fee:</b> Taxa de rede atual.\n` +
    `• 📈 <b>Cotação:</b> Preço real dos tokens.\n` +
    `• 🛡️ <b>Segurança:</b> Revogue permissões.\n` +
    `• 🔍 <b>Scanner:</b> Analise contratos suspeitos.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⛽ Taxas de Gás (Real-time)', 'tool_gas_price')],
    [Markup.button.callback('📈 Ver Preço dos Tokens', 'tool_price_list')],
    [Markup.button.callback('🛡️ Segurança & Revogação', 'tool_security')],
    [Markup.button.callback('⬅️ Voltar ao Terminal', 'start_panel')]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }
  return ctx.replyWithHTML(text, keyboard);
}

/**
 * ⛽ Tool: Real-time Gas Checker
 */
async function gasPriceHandler(ctx) {
  await ctx.answerCbQuery('⌛ Coletando dados das redes...');
  
  try {
    const [bscFee, polFee] = await Promise.all([
      providers.bsc.getFeeData(),
      providers.polygon.getFeeData()
    ]);

    const bscGas = formatUnits(bscFee.gasPrice, 'gwei');
    const polGas = formatUnits(polFee.gasPrice, 'gwei');

    const text = `⛽ <b>TAREFAS DE GÁS (GWEI)</b>\n\n` +
      `🟡 <b>BSC:</b> <code>${parseFloat(bscGas).toFixed(1)}</code> Gwei\n` +
      `🟣 <b>Polygon:</b> <code>${parseFloat(polGas).toFixed(1)}</code> Gwei\n\n` +
      `<i>Status: Redes operando normalmente.</i>`;

    return ctx.editMessageText(text, { 
      parse_mode: 'HTML', 
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar', 'tools_panel')]]).reply_markup
    });
  } catch (error) {
    return ctx.reply('❌ Erro ao consultar rede: ' + error.message);
  }
}

/**
 * 📈 Tool: Price List
 */
async function priceListHandler(ctx) {
  await ctx.answerCbQuery('⌛ Consultando GeckoTerminal...');
  
  try {
    const [bcoinBsc, senBsc, bcoinPol, senPol] = await Promise.all([
      priceService.getTokenPrice('BSC', 'BCOIN'),
      priceService.getTokenPrice('BSC', 'SEN'),
      priceService.getTokenPrice('POLYGON', 'BCOIN'),
      priceService.getTokenPrice('POLYGON', 'SEN')
    ]);

    const text = `📈 <b>COTAÇÃO ATUAL (USD)</b>\n\n` +
      `🟡 <b>Rede BSC:</b>\n` +
      `│ BCOIN: $${bcoinBsc.toFixed(6)}\n` +
      `│ SEN:   $${senBsc.toFixed(6)}\n\n` +
      `🟣 <b>Rede Polygon:</b>\n` +
      `│ BCOIN: $${bcoinPol.toFixed(6)}\n` +
      `│ SEN:   $${senPol.toFixed(6)}\n\n` +
      `🕒 <i>Dados via GeckoTerminal API</i>`;

    return ctx.editMessageText(text, { 
      parse_mode: 'HTML', 
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar', 'tools_panel')]]).reply_markup
    });
  } catch (error) {
    return ctx.reply('❌ Erro ao buscar preços: ' + error.message);
  }
}

/**
 * 🛡️ Tool: Security Info
 */
async function securityToolHandler(ctx) {
  const text = `🛡️ <b>SEGURANÇA DA CARTEIRA</b>\n\n` +
    `Mantenha sua carteira protegida usando ferramentas reconhecidas pelo mercado:\n\n` +
    `1️⃣ <b>Revoke.cash:</b> Utilize para revogar permissões de gasto (allowances) que você deu a contratos maliciosos ou antigos.\n\n` +
    `2️⃣ <b>De.Fi Scanner:</b> Analise o nível de risco de qualquer contrato inteligente antes de operar.\n\n` +
    `📍 <i>O robô usa o padrão de aprovação exata por trade, mas é uma boa prática monitorar sua carteira mensalmente.</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('🔒 Revoke.cash (Segurança)', 'https://revoke.cash')],
    [Markup.button.url('🔍 De.Fi Scanner (Auditoria)', 'https://de.fi/scanner')],
    [Markup.button.callback('⬅️ Voltar', 'tools_panel')]
  ]);

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
}

module.exports = {
  toolsPanelHandler,
  gasPriceHandler,
  priceListHandler,
  securityToolHandler
};
