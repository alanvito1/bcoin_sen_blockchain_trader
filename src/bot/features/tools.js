const { Markup } = require('telegraf');
const { providers } = require('../../services/blockchain');
const priceService = require('../../services/priceService');
const { formatUnits } = require('ethers');

/**
 * Main Tools Dashboard for Users
 */
async function toolsPanelHandler(ctx) {
  const text = `🛠️ <b>POWER-UPS & UTILITÁRIOS</b>\n\n` +
    `Escolha um item para sua jornada na arena:\n\n` +
    `• ⛽ <b>Radar de Gás:</b> Taxa de rede atual.\n` +
    `• 📈 <b>Gemas:</b> Preço real dos tokens.\n` +
    `• 🛡️ <b>Escudos:</b> Revogue permissões.\n` +
    `• 🔍 <b>Scanner:</b> Analise contratos sussurrados.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⛽ Radar de Gás (Real-time)', 'tool_gas_price')],
    [Markup.button.callback('📈 Preço das Gemas', 'tool_price_list')],
    [Markup.button.callback('🛡️ Escudos & Segurança', 'tool_security')],
    [Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]
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
      `🟡 <b>Setor BSC:</b> <code>${parseFloat(bscGas).toFixed(1)}</code> Gwei\n` +
      `🟣 <b>Setor Polygon:</b> <code>${parseFloat(polGas).toFixed(1)}</code> Gwei\n\n` +
      `<i>Status: Sinais de rede estáveis.</i>`;

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

    const text = `💎 <b>VALOR DAS GEMAS (USD)</b>\n\n` +
      `🟡 <b>Setor BSC:</b>\n` +
      `│ BCOIN: $${bcoinBsc.toFixed(6)}\n` +
      `│ SEN:   $${senBsc.toFixed(6)}\n\n` +
      `🟣 <b>Setor Polygon:</b>\n` +
      `│ BCOIN: $${bcoinPol.toFixed(6)}\n` +
      `│ SEN:   $${senPol.toFixed(6)}\n\n` +
      `🕒 <i>Scan via GeckoTerminal API</i>`;

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
  const text = `🛡️ <b>ESCUDOS E ANTI-MALWARE</b>\n\n` +
    `Mantenha sua integridade na arena usando ferramentas de elite:\n\n` +
    `1️⃣ <b>Revoke.cash (Shield):</b> Utilize para revogar acessos (allowances) de bosses maliciosos ou contratos antigos.\n\n` +
    `2️⃣ <b>De.Fi Scanner (Detector):</b> Analise o código de qualquer item antes de equipar.\n\n` +
    `📍 <i>O bot usa o padrão de aprovação exata por explosão, mas faça um scan manual mensal.</i>`;

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
