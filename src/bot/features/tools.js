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
    `• ⛽ <b>Radar de Gás:</b> Taxa de rede.\n` +
    `• 📈 <b>Gemas:</b> Cotação Real-time.\n` +
    `• 🛡️ <b>Escudos:</b> Revogue permissões.\n\n` +
    `🛠️ <b>UPGRADES DISPONÍVEIS EM BREVE:</b>\n` +
    `• 🛡️ <i>MEV Shield Pro:</i> Proteção total contra Front-run.\n` +
    `• ⚡ <i>Auto-Compound:</i> Reinvestimento de recompensas.\n` +
    `• 🎯 <i>Snipe Launch:</i> Detone no bloco 0.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⛽ Radar de Gás', 'tool_gas_price'), Markup.button.callback('📈 Preços', 'tool_price_list')],
    [Markup.button.callback('🛡️ Escudos & Segurança', 'tool_security')],
    [Markup.button.callback('⚡ Auto-Compound (Locked)', 'tool_coming_soon'), Markup.button.callback('🎯 Snipe (Locked)', 'tool_coming_soon')],
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

async function comingSoonHandler(ctx) {
  return ctx.answerCbQuery('🔒 Este Power-up está em fase de homologação e será liberado no Stage 2!', { show_alert: true });
}

module.exports = {
  toolsPanelHandler,
  gasPriceHandler,
  priceListHandler,
  securityToolHandler,
  comingSoonHandler
};
