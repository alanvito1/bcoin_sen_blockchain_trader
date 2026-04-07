const { Telegraf, Scenes, session, Markup } = require('telegraf');
const prisma = require('../config/prisma');
require('dotenv').config();

const startHandler = require('./commands/start');
const { 
  walletPanelHandler, 
  generateWalletHandler, 
  importWalletScene, 
  disconnectWalletScene,
  disconnectWalletHandler, 
  disconnectConfirmHandler,
  viewPrivateKeyHandler
} = require('./features/wallet');
const {
  tradePanelHandler,
  engineConfigHandler,
  updateConfigScene,
  startBotHandler,
  stopBotHandler,
  selectPairHandler,
  setPairHandler,
  setupStrategyAMenu,
  setupStrategyBMenu,
  setupWindowsMenu,
  setupPairMenu,
  logSettingsHandler,
  toggleLogPreference,
  strategySelectorMenu,
  setStrategyPreset,
  timeframeSelectorA,
  timeframeSelectorB,
  setTimeframe,
  setupRsiMenu,
  toggleRsi,
  setupScheduleMenu,
  setScheduleMode,
  setIntervalPreset,
  toggleMev,
} = require('./features/tradePanel');
const { storePanelHandler, selectNetworkHandler, selectAssetHandler, confirmCheckoutHandler, executePaymentHandler, onrampFlowHandler } = require('./features/store');
const { addTokenScene } = require('./features/tokenManager');
const { statusHandler, historyHandler } = require('./features/status');

const { 
  adminHandler, 
  broadcastHandler, 
  adminToolsHandler, 
  clearStuckHandler, 
  adminStatusHandler,
  dbHealthHandler 
} = require('./commands/admin');
const { supportPanelHandler, reportIssueHandler } = require('./features/support');
const { toolsPanelHandler, gasPriceHandler, priceListHandler, securityToolHandler } = require('./features/tools');
const { referralPanelHandler, showLootHistoryHandler, setupPayoutAddressScene } = require('./features/referral');
const rateLimit = require('./middleware/rateLimit');
const { TERMS_TEXT } = require('./constants/texts');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// 1. Session and Stage Setup
const stage = new Scenes.Stage([
  importWalletScene,
  updateConfigScene,
  disconnectWalletScene,
  setupPayoutAddressScene,
  addTokenScene
]);


const sessionStore = require('./sessionStore');

// 0. Maintenance Middleware
bot.use(async (ctx, next) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true';
  const isAdmin = String(ctx.from?.id) === String(process.env.ADMIN_TELEGRAM_ID);
  
  if (isMaintenance && !isAdmin) {
    const maintenanceText = `🛠️ <b>ARENA EM MANUTENÇÃO: UPGRADE DE HARDWARE</b>\n\n` +
      `Estamos tunando os servidores para garantir explosões mais rápidas e seguras na arena.\n\n` +
      `⏳ <b>Tempo Estimado:</b> Sincronizando blocos.\n\n` +
      `<i>Por favor, volte ao lobby mais tarde. O Boss avisará quando o sistema estiver 100% online!</i>`;
    
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('Sistema em manutenção. Tente novamente mais tarde.', { show_alert: true });
    }
    return ctx.replyWithHTML(maintenanceText);
  }
  return next();
});

bot.use(session({
  property: 'session',
  getSessionKey: (ctx) => ctx.from && ctx.chat && `${ctx.from.id}:${ctx.chat.id}`,
  store: sessionStore
}));
bot.use(rateLimit);
bot.use(stage.middleware());

// 2. Commands
bot.command('start', startHandler);
bot.command('add', (ctx) => ctx.scene.enter('ADD_TOKEN_SCENE'));
bot.command('loja', storePanelHandler);
bot.command('wallet', walletPanelHandler);
bot.command('carteira', walletPanelHandler);
bot.command('referral', referralPanelHandler);
bot.command('indicacao', referralPanelHandler);
bot.command('status', statusHandler);
bot.command('historico', historyHandler);
bot.command('ajuda', supportPanelHandler);
bot.command('cancel', async (ctx) => {
  await ctx.scene.leave();
  return ctx.reply('❌ Operação cancelada. Digite /start para o menu principal.');
});

// 3. Action Handlers (Inline Keyboards)
bot.action('start_panel', startHandler);
bot.action('wallet_panel', walletPanelHandler);
bot.action('trade_panel', tradePanelHandler);
bot.action('store_panel', storePanelHandler);
bot.action('onramp_flow', onrampFlowHandler);

// Sub-menus
bot.action('setup_strategy_a', setupStrategyAMenu);
bot.action('setup_strategy_b', setupStrategyBMenu);
bot.action('setup_windows', setupWindowsMenu);
bot.action('setup_pair_menu', setupPairMenu);
bot.action('manage_engine', async (ctx) => {
  const cfg = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  return engineConfigHandler(ctx, cfg.network, cfg.tokenPair.split('/')[0]);
});

// Multi-Engine Selection
bot.action(/^manage_(.+)_(.+)$/, (ctx) => engineConfigHandler(ctx, ctx.match[1], ctx.match[2]));

// Generic Config Editors
const configFields = {
  edit_buyAmountA:      { field: 'buyAmountA',      label: 'Compra Estrategia A' },
  edit_sellAmountA:     { field: 'sellAmountA',     label: 'Venda Estrategia A' },
  edit_buyAmountB:      { field: 'buyAmountB',      label: 'Compra Estrategia B' },
  edit_sellAmountB:     { field: 'sellAmountB',     label: 'Venda Estrategia B' },
  edit_window1Min:      { field: 'window1Min',      label: 'Janela 1 (Inicio)' },
  edit_window1Max:      { field: 'window1Max',      label: 'Janela 1 (Fim)' },
  edit_window2Min:      { field: 'window2Min',      label: 'Janela 2 (Inicio)' },
  edit_window2Max:      { field: 'window2Max',      label: 'Janela 2 (Fim)' },
  edit_maPeriodA:       { field: 'maPeriodA',       label: 'Periodo MA - Estrategia A' },
  edit_maPeriodB:       { field: 'maPeriodB',       label: 'Periodo MA - Estrategia B' },
  edit_rsiPeriod:       { field: 'rsiPeriod',       label: 'Periodo RSI' },
  edit_intervalMinutes: { field: 'intervalMinutes', label: 'Intervalo de execucao (minutos)' },
};

Object.entries(configFields).forEach(([action, info]) => {
  bot.action(action, (ctx) => {
    ctx.scene.enter('UPDATE_CONFIG_SCENE', { 
      field: info.field, 
      label: info.label,
      engineId: ctx.session.selectedEngineId
    });
  });
});

bot.action('generate_wallet', async (ctx) => {
  try {
    await generateWalletHandler(ctx);
  } catch (err) {
    ctx.reply('❌ Erro ao gerar carteira: ' + err.message);
  }
});

bot.action('import_wallet', (ctx) => ctx.scene.enter('IMPORT_WALLET_SCENE'));
bot.action('disconnect_wallet_confirm', disconnectConfirmHandler);
bot.action('view_private_key', viewPrivateKeyHandler);
bot.action('disconnect_wallet_force', (ctx) => ctx.scene.enter('DISCONNECT_WALLET_SCENE'));

bot.action('update_slippage', (ctx) => {
  ctx.scene.enter('UPDATE_CONFIG_SCENE', { field: 'slippage', label: 'Slippage', engineId: ctx.session.selectedEngineId });
});

bot.action('edit_slippage', (ctx) => {
  ctx.scene.enter('UPDATE_CONFIG_SCENE', { field: 'slippage', label: 'Slippage', engineId: ctx.session.selectedEngineId });
});

bot.action('update_pair', selectPairHandler);
bot.action(/^set_pair_(.+)$/, (ctx) => setPairHandler(ctx, ctx.match[1]));

bot.action('start_bot', startBotHandler);
bot.action('pause_bot', stopBotHandler);


// Handled in stopBotHandler

// Multi-engine doesn't need a single toggle anymore

bot.action('log_settings', logSettingsHandler);
bot.action('toggle_notifyTrades', (ctx) => toggleLogPreference(ctx, 'notifyTrades'));
bot.action('toggle_notifyBalances', (ctx) => toggleLogPreference(ctx, 'notifyBalances'));
bot.action('toggle_notifySteps', (ctx) => toggleLogPreference(ctx, 'notifySteps'));

// Strategy Selector
bot.action('strategy_selector',  strategySelectorMenu);
bot.action('set_strategy_none',  (ctx) => setStrategyPreset(ctx, false, false));
bot.action('set_strategy_30m',   (ctx) => setStrategyPreset(ctx, true,  false));
bot.action('set_strategy_4h',    (ctx) => setStrategyPreset(ctx, false, true));
bot.action('set_strategy_both',  (ctx) => setStrategyPreset(ctx, true,  true));

// Timeframe Selectors
bot.action('select_tf_a', timeframeSelectorA);
bot.action('select_tf_b', timeframeSelectorB);
const VALID_TFS = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'];
VALID_TFS.forEach(tf => {
  bot.action(`set_tf_a_${tf}`, (ctx) => setTimeframe(ctx, 'timeframeA', tf, timeframeSelectorA));
  bot.action(`set_tf_b_${tf}`, (ctx) => setTimeframe(ctx, 'timeframeB', tf, timeframeSelectorB));
});

// RSI & MEV
bot.action('setup_rsi',  setupRsiMenu);
bot.action('toggle_rsi', toggleRsi);
bot.action('toggle_mev', toggleMev);

// Schedule Mode
bot.action('setup_schedule',       setupScheduleMenu);
bot.action('set_schedule_window',  (ctx) => setScheduleMode(ctx, 'window'));
bot.action('set_schedule_interval',(ctx) => setScheduleMode(ctx, 'interval'));
bot.action('noop',                 (ctx) => ctx.answerCbQuery());
const INTERVAL_PRESETS = [5, 15, 30, 60, 120, 240, 360, 720, 1440];
INTERVAL_PRESETS.forEach(mins => {
  bot.action(`set_interval_${mins}`, (ctx) => setIntervalPreset(ctx, mins));
});

bot.action('accept_terms', async (ctx) => {
  const telegramId = BigInt(ctx.from.id);
  await prisma.user.update({
    where: { telegramId },
    data: { hasAcceptedTerms: true }
  });
  await ctx.answerCbQuery('✅ Termos aceitos!');
  return startHandler(ctx);
});

bot.action('refuse_terms', async (ctx) => {
  await ctx.answerCbQuery('❌ Termos recusados.');
  const text = `<b>Ok! Entendemos sua escolha.</b>\n\nCaso mude de ideia e queira utilizar o bot aceitando os termos e riscos, basta digitar /start novamente a qualquer momento.\n\n<i>Até logo!</i>`;
  return ctx.editMessageText(text, { parse_mode: 'HTML' });
});

// Admin Tools Actions
bot.action('admin_panel', adminHandler);
bot.action('admin_tools', adminToolsHandler);
bot.action('admin_clear_stuck_polygon', (ctx) => clearStuckHandler(ctx, 'POLYGON'));
bot.action('admin_clear_stuck_bsc', (ctx) => clearStuckHandler(ctx, 'BSC'));
bot.action('admin_db_health', dbHealthHandler);
bot.action('admin_status', adminStatusHandler);

bot.action(/^buy_package_(.+)$/, (ctx) => selectNetworkHandler(ctx, ctx.match[1]));
bot.action(/^select_asset_(.+)_(.+)$/, (ctx) => selectAssetHandler(ctx, ctx.match[1], ctx.match[2]));
bot.action(/^confirm_checkout_(.+)_(.+)_(.+)$/, (ctx) => confirmCheckoutHandler(ctx, ctx.match[1], ctx.match[2], ctx.match[3]));
bot.action(/^execute_payment_(.+)_(.+)_(.+)_(.+)$/, (ctx) => executePaymentHandler(ctx, ctx.match[1], ctx.match[2], ctx.match[3], ctx.match[4]));

bot.action('quick_guide', (ctx) => {
  const text = `📖 <b>MANUAL DO BOMBER: REGRAS DA ARENA</b>\n\n` +
    `1️⃣ <b>Equipe seu Cofre:</b> No menu Inventário, forneça sua chave ou forje uma nova.\n` +
    `2️⃣ <b>Carga de Gás:</b> Envie MATIC (Polygon) ou BNB (BSC) para cobrir o custo das explosões.\n` +
    `3️⃣ <b>Compre Munição:</b> No Item Shop, adquira Fire-Charges para as operações.\n` +
    `4️⃣ <b>Plante a Bomba:</b> Na Arena, escolha seu par e clique em "PLANTAR BOMBA".\n\n` +
    `<i>O robô operará 24h/dia seguindo seus timers de detonação.</i>`;
  
  return ctx.editMessageText(text, { 
    parse_mode: 'HTML', 
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📜 Regras do Jogo (Termos)', 'view_terms')],
      [Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]
    ]).reply_markup
  });
});

bot.action('view_terms', (ctx) => {
  return ctx.editMessageText(TERMS_TEXT, {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar ao Manual', 'quick_guide')]]).reply_markup
  });
});

bot.action('support_link', (ctx) => {
  const text = `🛠️ <b>CENTRAL DE COMANDO (SUPORTE)</b>\n\n` +
    `Precisa de ajuda com seus itens ou power-ups?\n\n` +
    `• <b>Game Master:</b> @SeuSuporteUser\n` +
    `• <b>Bugs:</b> Use o botão abaixo para reportar falhas na arena.\n` +
    `• <b>Guilda:</b> Parcerias e White-label.\n\n` +
    `<i>Nossa guilda responde em tempo real em dias úteis.</i>`;

  return ctx.editMessageText(text, { 
    parse_mode: 'HTML', 
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('💬 Reportar Problema Técnico', 'report_issue')],
      [Markup.button.callback('⬅️ Voltar ao Terminal', 'start_panel')]
    ]).reply_markup
  });
});

bot.action('report_issue', supportPanelHandler);
bot.action(/^report_issue_type_(.+)$/, (ctx) => reportIssueHandler(ctx, ctx.match[1]));

bot.action('tools_panel', toolsPanelHandler);
bot.action('tool_gas_price', gasPriceHandler);
bot.action('tool_price_list', priceListHandler);
bot.action('tool_security', securityToolHandler);

bot.action('referral_panel', referralPanelHandler);
bot.action('status_panel', statusHandler);
bot.action('view_history', historyHandler);
bot.action('setup_referral_payout', (ctx) => ctx.scene.enter('SETUP_PAYOUT_ADDRESS'));
bot.action('view_loot_history', showLootHistoryHandler);

bot.action('start_panel', startHandler);




const logger = require('../utils/logger');

// 4. Error Handling
bot.catch((err, ctx) => {
  logger.error(`[Telegraf] Error for ${ctx.updateType}:`, err);
  
  const text = `❌ <b>Ocorreu um erro inesperado no bot.</b>\n\n` +
    `Se este problema persistir ou você estiver travado em um menu, utilize o botão abaixo para alertar o suporte técnico.`;
  
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🚨 Reportar ao Suporte', 'report_issue')],
    [Markup.button.callback('⬅️ Ir para Início', 'start_panel')]
  ]);

  try {
    return ctx.replyWithHTML(text, keyboard);
  } catch (e) {
    logger.error('[Telegraf] Failed to send error message:', e);
  }
});

// 5. Start Bot
if (process.env.TELEGRAM_BOT_TOKEN) {
  bot.launch().then(() => {
    logger.info('🚀 Telegram Bot is running...');
  });
} else {
  logger.error('❌ TELEGRAM_BOT_TOKEN is missing!');
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// 6. Background Workers
require('../worker/billingCron');
require('../worker/notificationWorker');

module.exports = bot;
