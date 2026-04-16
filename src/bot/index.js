const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
// Use built-in session from telegraf or fix the import
const { Telegraf, Scenes, Markup, session } = require('telegraf');

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
    toggleAntiRug,
    toggleAutoSell,
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
    broadcastHandler, 
    adminToolsHandler, 
    clearStuckHandler, 
    adminStatusHandler,
    dbHealthHandler,
    rotateTransitWalletHandler,
    revealTransitWalletHandler,
    showTransitWalletHandler
  } = require('./commands/admin');


  const { supportPanelHandler, supportWizard } = require('./features/support');
  const { manualPanelHandler } = require('./features/manual');
  const { referralPanelHandler, showLootHistoryHandler, setupPayoutAddressScene } = require('./features/referral');

  // 4. Initialization Logic
  bot = require('../config/bot');
  console.log('[INIT] Bot singleton loaded successfully.');

  // 5. Scenes Stage setup
  const stage = new Scenes.Stage([
    importWalletScene,
    disconnectWalletScene,
    updateConfigScene,
    addTokenScene,
    setupPayoutAddressScene,
    supportWizard
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
  register('command', 'store', storePanelHandler);
  register('command', 'wallet', walletPanelHandler);
  register('command', 'referral', referralPanelHandler);
  register('command', 'history', historyHandler);
  register('command', 'help', supportPanelHandler);
  register('command', 'rotate_wallet', rotateTransitWalletHandler);
  register('command', 'reveal_transit', revealTransitWalletHandler);
  register('command', 'show_transit', showTransitWalletHandler);

  register('command', 'cancel', async (ctx) => {
    await ctx.scene.leave();
    return ctx.reply('❌ Operation canceled. Type /start for the main menu.');
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
  register('action', 'support_link', supportPanelHandler);
  register('action', 'quick_guide', manualPanelHandler);
  register('action', 'referral_panel', referralPanelHandler);
  register('action', 'view_loot_history', showLootHistoryHandler);
  register('action', 'log_settings', logSettingsHandler);
  
  // Log Preference Toggles
  bot.action('toggle_notifyTrades', (ctx) => toggleLogPreference(ctx, 'notifyTrades'));
  bot.action('toggle_notifyBalances', (ctx) => toggleLogPreference(ctx, 'notifyBalances'));
  bot.action('toggle_notifySteps', (ctx) => toggleLogPreference(ctx, 'notifySteps'));
  
  bot.action('setup_referral_payout', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('SETUP_PAYOUT_ADDRESS');
  });
  
  bot.action(/^open_ticket_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('SUPPORT_WIZARD', { typeKey: ctx.match[1] });
  });
  
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
  bot.action('manage_engine', async (ctx) => {
    const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
    if (!config) return ctx.answerCbQuery('⚠️ No engine selected.');
    return engineConfigHandler(ctx, config.network, config.tokenPair?.split('/')[0] || 'TOKEN');
  });

  bot.action('update_pair', selectPairHandler);
  bot.action(/^set_pair_(.+)$/, (ctx) => setPairHandler(ctx, ctx.match[1]));
  
  // Strategy & Menu Navigation
  bot.action('setup_strategy_a', setupStrategyAMenu);
  bot.action('setup_strategy_b', setupStrategyBMenu);
  bot.action('setup_schedule', setupScheduleMenu);
  bot.action('setup_rsi', setupRsiMenu);
  bot.action('strategy_selector', strategySelectorMenu);
  bot.action('setup_windows', setupWindowsMenu);
  bot.action('toggle_rsi', toggleRsi);
  bot.action('toggle_mev', toggleMev);
  bot.action('toggle_anti_rug', toggleAntiRug);
  bot.action('toggle_auto_sell', toggleAutoSell);
  bot.action('setup_settings', setupSettingsMenu);
  bot.action('toggle_slippage', toggleSlippage);
  bot.action('toggle_priority', togglePriority);

  // Timeframe Setters
  bot.action(/^set_tf_a_(.+)$/, (ctx) => setTimeframe(ctx, 'timeframeA', ctx.match[1], setupStrategyAMenu));
  bot.action(/^set_tf_b_(.+)$/, (ctx) => setTimeframe(ctx, 'timeframeB', ctx.match[1], setupStrategyBMenu));
  bot.action('select_tf_a', timeframeSelectorA);
  bot.action('select_tf_b', timeframeSelectorB);

  // Strategy Presets
  bot.action('set_strategy_none', (ctx) => setStrategyPreset(ctx, false, false));
  bot.action('set_strategy_30m', (ctx) => setStrategyPreset(ctx, true, false));
  bot.action('set_strategy_4h', (ctx) => setStrategyPreset(ctx, false, true));
  bot.action('set_strategy_both', (ctx) => setStrategyPreset(ctx, true, true));

  // Schedule Presets
  bot.action('set_schedule_window', (ctx) => setScheduleMode(ctx, 'window'));
  bot.action('set_schedule_interval', (ctx) => setScheduleMode(ctx, 'interval'));
  bot.action(/^set_interval_(\d+)$/, (ctx) => setIntervalPreset(ctx, parseInt(ctx.match[1])));

  // Numeric Field Editors (Generic Regex)
  bot.action(/^edit_(.+)$/, async (ctx) => {
    const field = ctx.match[1];
    const labels = {
      buyAmountA: 'Compra A', sellAmountA: 'Venda A', maPeriodA: 'MA A',
      buyAmountB: 'Compra B', sellAmountB: 'Venda B', maPeriodB: 'MA B',
      intervalMinutes: 'Intervalo', slippage: 'Precisão', rsiPeriod: 'Período RSI',
      window1Min: 'Início J1', window1Max: 'Fim J1', window2Min: 'Início J2', window2Max: 'Fim J2'
    };
    await ctx.answerCbQuery();
    return ctx.scene.enter('UPDATE_CONFIG_SCENE', { 
      field, 
      label: labels[field] || field, 
      engineId: ctx.session.selectedEngineId 
    });
  });

  bot.action('start_bot', startBotHandler);
  bot.action('pause_bot', stopBotHandler);
  
  // Terms & Admin
  bot.action('accept_terms', async (ctx) => {
    await prisma.user.update({ where: { telegramId: BigInt(ctx.from.id) }, data: { hasAcceptedTerms: true } });
    await ctx.answerCbQuery('✅ Terms accepted!');
    return startHandler(ctx);
  });
  
  bot.action('admin_panel', adminHandler);
  bot.action('admin_tools', adminToolsHandler);
  bot.action('admin_status', adminStatusHandler);
  bot.action('admin_clear_stuck_polygon', (ctx) => clearStuckHandler(ctx, 'POLYGON'));
  bot.action('admin_clear_stuck_bsc', (ctx) => clearStuckHandler(ctx, 'BSC'));
  bot.action('admin_db_health', dbHealthHandler);
  bot.action('broadcast_prompt', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('📢 Send the broadcast message below using the command:\n/broadcast YOUR MESSAGE');
  });

  bot.action(/^buy_package_(.+)$/, (ctx) => selectNetworkHandler(ctx, ctx.match[1]));

  // Global Error Catch
  bot.catch((err, ctx) => {
    logger.error(`[Telegraf] Error for ${ctx.updateType}:`, err);
    if (err.description && err.description.includes('Too Many Requests')) {
      logger.warn('[Telegraf] 429 Rate Limit hit. Skipping global error reply to avoid loop.');
      return;
    }
    try {
      return ctx.replyWithHTML('❌ <b>An unexpected error occurred.</b> Please try again in a few moments.').catch(() => {});
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
      console.error('⚠️ [System] Continuing anyway to allow Workers to run...');
      // process.exit(1); 
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
