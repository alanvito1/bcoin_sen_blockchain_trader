const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Telegraf, Scenes, Markup } = require('telegraf');
const { session } = require('@telegraf/session');

// 1. Core Services
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

console.log('[DEBUG] >>> BOT ENGINE INITIALIZING...');

let bot;

try {
  // 2. Load Middlewares
  const { telemetryMiddleware } = require('./middleware/telemetry');
  const rateLimit = require('./middleware/rateLimit');
  const sessionStore = require('./sessionStore');

  // 3. Load Feature Handlers & Scenes
  const startHandler = require('./commands/start');
  const { 
    walletPanelHandler, 
    generateWalletHandler, 
    importWalletScene, 
    disconnectWalletScene,
    viewPrivateKeyHandler,
    disconnectConfirmHandler 
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
    toggleAutoSell,
    toggleAntiRug,
    setupSettingsMenu,
    toggleSlippage,
    togglePriority,
    buyAmountSelectorA,
    setBuyAmountA,
    sellAmountSelectorA,
    setSellAmountA,
    buyAmountSelectorB,
    setBuyAmountB,
    sellAmountSelectorB,
    setSellAmountB,
    tradeStatsHandler,
    resetStatsHandler,
  } = require('./features/tradePanel');

  const { 
    storePanelHandler, 
    selectNetworkHandler, 
    selectAssetHandler, 
    confirmCheckoutHandler, 
    executePaymentHandler, 
    onrampFlowHandler 
  } = require('./features/store');

  const { addTokenScene } = require('./features/tokenManager');
  const { statusHandler, historyHandler } = require('./features/status');

  const { 
    adminHandler, 
    adminToolsHandler, 
    clearStuckHandler, 
    adminStatusHandler,
    dbHealthHandler 
  } = require('./commands/admin');

  const { supportPanelHandler, reportIssueHandler } = require('./features/support');
  const { toolsPanelHandler, gasPriceHandler, priceListHandler, securityToolHandler } = require('./features/tools');
  const { referralPanelHandler, showLootHistoryHandler, setupPayoutAddressScene } = require('./features/referral');

  // 4. Initialization Logic
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('CRITICAL: TELEGRAM_BOT_TOKEN is missing from environment!');
  }

  bot = new Telegraf(token);
  console.log('[INIT] Telegraf instantiated successfully.');

  // 5. Scenes Stage setup
  const stage = new Scenes.Stage([
    importWalletScene,
    disconnectWalletScene,
    updateConfigScene,
    addTokenScene,
    setupPayoutAddressScene
  ]);

  // 6. Apply Middlewares
  bot.use(telemetryMiddleware);
  bot.use(session({ 
    store: sessionStore,
    getSessionKey: (ctx) => ctx.from && ctx.chat && `${ctx.from.id}:${ctx.chat.id}`
  }));
  bot.use(rateLimit);
  bot.use(stage.middleware());

  console.log('[INIT] Middleware registered.');

  // 7. Command Registration Helper
  const register = (type, trigger, handler) => {
    if (typeof handler !== 'function') {
      throw new Error(`[INIT] Handler for ${type}('${trigger}') is ${typeof handler}!`);
    }
    if (type === 'command') bot.command(trigger, handler);
    if (type === 'action') bot.action(trigger, handler);
  };

  // 8. Register Commands
  console.log('[INIT] Registering Routes...');
  register('command', 'start', startHandler);
  register('command', 'add', (ctx) => ctx.scene.enter('ADD_TOKEN_SCENE'));
  register('command', 'loja', storePanelHandler);
  register('command', 'wallet', walletPanelHandler);
  register('command', 'carteira', walletPanelHandler);
  register('command', 'referral', referralPanelHandler);
  register('command', 'indicacao', referralPanelHandler);
  register('command', 'status', statusHandler);
  register('command', 'historico', historyHandler);
  register('command', 'ajuda', supportPanelHandler);
  register('command', 'cancel', async (ctx) => {
    await ctx.scene.leave();
    return ctx.reply('❌ Operação cancelada. Digite /start para o menu principal.');
  });

  // Actions
  register('action', 'start_panel', startHandler);
  register('action', 'wallet_panel', walletPanelHandler);
  register('action', 'trade_panel', tradePanelHandler);
  register('action', 'store_panel', storePanelHandler);
  register('action', 'onramp_flow', onrampFlowHandler);
  register('action', 'setup_strategy_a', setupStrategyAMenu);
  register('action', 'setup_strategy_b', setupStrategyBMenu);
  register('action', 'setup_windows', setupWindowsMenu);
  register('action', 'setup_pair_menu', setupPairMenu);
  
  bot.action('generate_wallet', generateWalletHandler);
  bot.action('import_wallet', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('IMPORT_WALLET_SCENE');
  });
  bot.action('disconnect_wallet_confirm', disconnectConfirmHandler);
  bot.action('view_private_key', viewPrivateKeyHandler);
  bot.action('disconnect_wallet_force', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('DISCONNECT_WALLET_SCENE');
  });
  
  // Multi-engine / Generic Actions
  bot.action(/^manage_(.+)_(.+)$/, (ctx) => engineConfigHandler(ctx, ctx.match[1], ctx.match[2]));
  bot.action('update_pair', selectPairHandler);
  bot.action(/^set_pair_(.+)$/, (ctx) => setPairHandler(ctx, ctx.match[1]));
  bot.action('start_bot', startBotHandler);
  bot.action('pause_bot', stopBotHandler);
  
  // Terms & Admin
  bot.action('accept_terms', async (ctx) => {
    await prisma.user.update({ where: { telegramId: BigInt(ctx.from.id) }, data: { hasAcceptedTerms: true } });
    await ctx.answerCbQuery('✅ Termos aceitos!');
    return startHandler(ctx);
  });
  
  bot.action('admin_panel', adminHandler);
  bot.action(/^buy_package_(.+)$/, (ctx) => selectNetworkHandler(ctx, ctx.match[1]));

  // Global Error Catch
  bot.catch((err, ctx) => {
    logger.error(`[Telegraf] Error for ${ctx.updateType}:`, err);
    try {
      return ctx.replyWithHTML('❌ <b>Ocorreu um erro inesperado.</b> Tente novamente em alguns instantes.');
    } catch (e) {
      logger.error('[Telegraf] Silent failure in error reporter:', e);
    }
  });

  // 9. Launch
  console.log('[INIT] Launching Bot...');
  bot.launch()
    .then(() => {
      console.log('🚀 [SUCCESS] Bot Arena Bomberman is LIVE!');
      logger.info('Bot started successfully');
    })
    .catch((err) => {
      console.error('❌ CRITICAL: Launch Failure:', err);
      process.exit(1);
    });

} catch (initErr) {
  console.error('\n💥 [FATAL] ENGINE INITIALIZATION FAILED:');
  console.error('-----------------------------------------');
  console.error('Message:', initErr.message);
  console.error('Stack:', initErr.stack);
  console.error('-----------------------------------------\n');
  process.exit(1);
}

// Graceful Shutdown
process.once('SIGINT', () => bot && bot.stop('SIGINT'));
process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));

module.exports = bot;
