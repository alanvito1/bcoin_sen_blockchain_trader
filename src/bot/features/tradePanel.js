/* eslint-disable no-await-in-loop */
'use strict';

const { Markup, Scenes } = require('telegraf');
const prisma = require('../../config/prisma');
const balanceService = require('../../services/balanceService');
const logger = require('../../utils/logger');
const { TIMEFRAME_MAP } = require('../../services/tradingStrategy');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d', '1w'];

const CONFIG_LIMITS = {
  buyAmountA:      { min: 0.001, max: 1000000 },
  sellAmountA:     { min: 0.001, max: 1000000 },
  buyAmountB:      { min: 0.001, max: 1000000 },
  sellAmountB:     { min: 0.001, max: 1000000 },
  window1Min:      { min: 0,   max: 59 },
  window1Max:      { min: 0,   max: 59 },
  window2Min:      { min: 0,   max: 59 },
  window2Max:      { min: 0,   max: 59 },
  slippage:        { min: 0.1, max: 100 },
  maPeriodA:       { min: 2,   max: 200 },
  maPeriodB:       { min: 2,   max: 200 },
  rsiPeriod:       { min: 2,   max: 100 },
  intervalMinutes: { min: 1,   max: 1440 },
};

// Normalize legacy timeframe strings stored in DB
function normalizeTF(tf) {
  if (VALID_TIMEFRAMES.includes(tf)) return tf;
  const aliases = { '15': '15m', '30': '30m', '4': '4h', 'hour': '1h', '1': '1h' };
  return aliases[tf] || '30m';
}

// Format minutes into human-readable label
function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

// ---------------------------------------------------------------------------
// Scene: generic numeric field editor
// ---------------------------------------------------------------------------
const updateConfigScene = new Scenes.WizardScene(
  'UPDATE_CONFIG_SCENE',
  async (ctx) => {
    const { label } = ctx.scene.session.state;
    await ctx.reply(`🎮 <b>Tuning ${label}:</b>\nEnvie o novo nível (valor numérico):`, { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      return ctx.reply('❌ Por favor, <b>digite</b> um valor numérico válido (ex: 0.05).', { parse_mode: 'HTML' });
    }

    const text = ctx.message.text.trim();
    if (text === '/cancel' || text === '/start') {
      await ctx.reply('❌ Operação cancelada.');
      return ctx.scene.leave();
    }

    const { field, label, engineId } = ctx.scene.session.state;
    const value = parseFloat(text.replace(',', '.'));

    if (isNaN(value)) return ctx.reply('❌ Por favor, envie apenas números.');

    const limits = CONFIG_LIMITS[field];
    if (limits && (value < limits.min || value > limits.max)) {
      return ctx.reply(
        `⚠️ <b>Valor Inválido:</b> ${label} deve estar entre <code>${limits.min}</code> e <code>${limits.max}</code>.`,
        { parse_mode: 'HTML' }
      );
    }

    // Window consistency validation
    if (field.endsWith('Max')) {
      const minField = field.replace('Max', 'Min');
      const current = await prisma.tradeConfig.findUnique({ where: { id: engineId } });
      if (value <= current[minField]) {
        return ctx.reply(
          `⚠️ <b>Valor Inválido:</b> Fim deve ser maior que Início (${current[minField]}m).`,
          { parse_mode: 'HTML' }
        );
      }
    }
    if (field.endsWith('Min')) {
      const maxField = field.replace('Min', 'Max');
      const current = await prisma.tradeConfig.findUnique({ where: { id: engineId } });
      if (value >= current[maxField]) {
        return ctx.reply(
          `⚠️ <b>Valor Inválido:</b> Início deve ser menor que Fim (${current[maxField]}m).`,
          { parse_mode: 'HTML' }
        );
      }
    }

    try {
      await prisma.tradeConfig.update({ where: { id: engineId }, data: { [field]: value } });
      await ctx.reply(
        `✅ <b>${label} atualizado:</b> <code>${value}</code>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Voltar', 'manage_engine')]]) }
      );
      return ctx.scene.leave();
    } catch (err) {
      logger.error(`[TradePanel] Error updating ${field}:`, err);
      return ctx.reply('❌ Erro ao salvar configuração. Tente novamente.');
    }
  }
);

// ---------------------------------------------------------------------------
// Trade Panel — engine list
// ---------------------------------------------------------------------------
async function tradePanelHandler(ctx) {
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery().catch(() => {});
  }
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { tradeConfigs: true, wallet: true },
  });

  const text = '🕹️ <b>Arena &gt; Selecionar Bomba</b>\nEscolha qual motor você deseja armar ou configurar:';

  const getBtnLabel = (network, token) => {
    const cfg = user.tradeConfigs.find(c => c.network === network && c.tokenPair.startsWith(token));
    return `${cfg?.isOperating ? '🟢' : '🔴'} ${network} - ${token}`;
  };

  const buttons = [
    [Markup.button.callback(getBtnLabel('BSC', 'BCOIN'), 'manage_BSC_BCOIN'), Markup.button.callback(getBtnLabel('BSC', 'SEN'), 'manage_BSC_SEN')],
    [Markup.button.callback(getBtnLabel('POLYGON', 'BCOIN'), 'manage_POLYGON_BCOIN'), Markup.button.callback(getBtnLabel('POLYGON', 'SEN'), 'manage_POLYGON_SEN')],
    [Markup.button.callback('⚙️ Configurações de Logs', 'log_settings')],
    [Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')],
  ];

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }
  return ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
}

// ---------------------------------------------------------------------------
// Engine Config — main panel for a specific engine
// ---------------------------------------------------------------------------
async function engineConfigHandler(ctx, network, token) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { tradeConfigs: true, wallet: true },
  });
  const configGlobal = require('../../config');

  let config = user.tradeConfigs.find(c => c.network === network && c.tokenPair.startsWith(token));

  if (!config) {
    config = await prisma.tradeConfig.create({
      data: {
        userId:         user.id,
        network,
        tokenPair:      `${token}/USDT`,
        buyAmountA:     parseFloat(configGlobal.strategy.strategyA.buyAmount),
        sellAmountA:    parseFloat(configGlobal.strategy.strategyA.sellAmount),
        buyAmountB:     parseFloat(configGlobal.strategy.strategyB.buyAmount),
        sellAmountB:    parseFloat(configGlobal.strategy.strategyB.sellAmount),
        window1Min:     configGlobal.scheduler.window1.min,
        window1Max:     configGlobal.scheduler.window1.max,
        window2Min:     configGlobal.scheduler.window2.min,
        window2Max:     configGlobal.scheduler.window2.max,
        slippage:       configGlobal.slippage,
        isOperating:    false,
        timeframeA:     '30m',
        timeframeB:     '4h',
        maPeriodA:      parseInt(configGlobal.strategy.strategyA.maPeriod) || 21,
        maPeriodB:      parseInt(configGlobal.strategy.strategyB.maPeriod) || 21,
        rsiEnabled:     false,
        rsiPeriod:      14,
        scheduleMode:   'window',
        intervalMinutes: 60,
      },
    });
  }

  ctx.session.selectedEngineId = config.id;

  const tfA = normalizeTF(config.timeframeA || '30m');
  const tfB = normalizeTF(config.timeframeB || '4h');
  const mode = config.scheduleMode || 'window';

  const stratLabel = (() => {
    if (config.strategy30m && config.strategy4h) return `A(${tfA}) + B(${tfB})`;
    if (config.strategy30m) return `Apenas A (${tfA})`;
    if (config.strategy4h) return `Apenas B (${tfB})`;
    return 'Desligado ⚠️';
  })();

  const scheduleLabel = mode === 'interval'
    ? `Intervalo: ${formatMinutes(config.intervalMinutes || 60)}`
    : `Janelas: ${config.window1Min}-${config.window1Max}m / ${config.window2Min}-${config.window2Max}m`;

  const rsiStr = config.rsiEnabled ? `RSI${config.rsiPeriod} ON` : 'RSI OFF';

  const text =
    `💣 <b>Mina &gt; ${network} - ${token}</b>\n` +
    `🤖 <b>Status:</b> ${config.isOperating ? '🟢 EM OPERAÇÃO' : '🔴 PAUSADO'}\n\n` +
    `💱 <b>Par:</b> <code>${config.tokenPair}</code>  Precisão: <code>${config.slippage}%</code>\n\n` +
    `🔥 <b>Explosivo A</b> [${tfA} | MA${config.maPeriodA}]:  <code>${config.buyAmountA}</code> Buy / <code>${config.sellAmountA}</code> Sell\n` +
    `💥 <b>Explosivo B</b> [${tfB} | MA${config.maPeriodB}]:  <code>${config.buyAmountB}</code> Buy / <code>${config.sellAmountB}</code> Sell\n\n` +
    `⏲️ <b>Timer:</b> <code>${scheduleLabel}</code>\n` +
    `🔀 <b>Disparos:</b> <code>${stratLabel}</code>   📊 ${rsiStr}\n` +
    `🛡️ <b>Anti-Sandwich:</b> <code>${config.antiSandwichEnabled ? 'ATIVADO (Taxa extra)' : 'DESATIVADO (Padrão)'}</code>\n\n` +
    `Escolha uma seção para calibrar seu setup:`;

  const buttons = [
    [Markup.button.callback(`🔥 Explosivo A (${tfA})`, 'setup_strategy_a'), Markup.button.callback(`💥 Explosivo B (${tfB})`, 'setup_strategy_b')],
    [Markup.button.callback('⏲️ Timer de Detonação', 'setup_schedule'), Markup.button.callback(`🎯 Precisão: ${config.slippage}%`, 'edit_slippage')],
    [Markup.button.callback(`📊 RSI: ${rsiStr}`, 'setup_rsi'), Markup.button.callback(`🛡️ MEV: ${config.antiSandwichEnabled ? 'ON' : 'OFF'}`, 'toggle_mev')],
    [Markup.button.callback(`🔀 Modos: ${stratLabel}`, 'strategy_selector'), Markup.button.callback('🛡️ Proteções & Gás', 'setup_settings')],
    [config.isOperating
      ? Markup.button.callback('🔴 RECOLHER BOMBA', 'pause_bot')
      : Markup.button.callback('🟢 PLANTAR BOMBA', 'start_bot')],
    [Markup.button.callback('⬅️ Voltar à Arena', 'trade_panel')],
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ---------------------------------------------------------------------------
// Strategy A sub-menu
// ---------------------------------------------------------------------------
async function setupStrategyAMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const tfA = normalizeTF(config.timeframeA || '30m');

  const text =
    `🔥 <b>Arena &gt; ${config.network} &gt; ${config.tokenPair?.split('/')[0] || 'TOKEN'} &gt; Explosivo A</b>\n` +
    `Status: <b>${config.strategy30m ? '🟢 Ativa' : '🔴 Inativa'}</b>  |  Timeframe: <code>${tfA}</code>  |  MA: <code>MA${config.maPeriodA}</code>\n\n` +
    `Calibre o poder de fogo desta estratégia:`;

  const buttons = [
    [Markup.button.callback(`💰 Compra: ${config.buyAmountA} TOKENS`, 'edit_buyAmountA')],
    [Markup.button.callback(`💸 Venda: ${config.sellAmountA} TOKENS`, 'edit_sellAmountA')],
    [Markup.button.callback(`📈 Período MA: ${config.maPeriodA} velas`, 'edit_maPeriodA')],
    [Markup.button.callback(`⏱ Timeframe: ${tfA}`, 'select_tf_a')],
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ---------------------------------------------------------------------------
// Strategy B sub-menu
// ---------------------------------------------------------------------------
async function setupStrategyBMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const tfB = normalizeTF(config.timeframeB || '4h');

  const text =
    `💥 <b>Arena &gt; ${config.network} &gt; ${config.tokenPair?.split('/')[0] || 'TOKEN'} &gt; Explosivo B</b>\n` +
    `Status: <b>${config.strategy4h ? '🟢 Ativa' : '🔴 Inativa'}</b>  |  Timeframe: <code>${tfB}</code>  |  MA: <code>MA${config.maPeriodB}</code>\n\n` +
    `Calibre o poder de fogo desta estratégia:`;

  const buttons = [
    [Markup.button.callback(`💰 Compra: ${config.buyAmountB} TOKENS`, 'edit_buyAmountB')],
    [Markup.button.callback(`💸 Venda: ${config.sellAmountB} TOKENS`, 'edit_sellAmountB')],
    [Markup.button.callback(`📈 Período MA: ${config.maPeriodB} velas`, 'edit_maPeriodB')],
    [Markup.button.callback(`⏱ Timeframe: ${tfB}`, 'select_tf_b')],
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ---------------------------------------------------------------------------
// Timeframe Selector — shared builder
// ---------------------------------------------------------------------------
function buildTimeframeButtons(current, prefixAction, backAction) {
  const mark = (tf) => tf === current ? '✅' : '⬜';
  return [
    [
      Markup.button.callback(`${mark('5m')} 5m`,  `${prefixAction}_5m`),
      Markup.button.callback(`${mark('15m')} 15m`, `${prefixAction}_15m`),
      Markup.button.callback(`${mark('30m')} 30m`, `${prefixAction}_30m`),
    ],
    [
      Markup.button.callback(`${mark('1h')} 1h`,  `${prefixAction}_1h`),
      Markup.button.callback(`${mark('4h')} 4h`,  `${prefixAction}_4h`),
    ],
    [
      Markup.button.callback(`${mark('1d')} Diário`,  `${prefixAction}_1d`),
      Markup.button.callback(`${mark('1w')} Semanal`, `${prefixAction}_1w`),
    ],
    [Markup.button.callback('⬅️ Voltar', backAction)],
  ];
}

async function timeframeSelectorA(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const current = normalizeTF(config.timeframeA || '30m');
  const token = config.tokenPair?.split('/')[0] || 'TOKEN';

  const text =
    `⏱ <b>Motores &gt; ${config.network} &gt; ${token} &gt; Timeframe — Estratégia A</b>\n\n` +
    `Atual: <code>${current}</code>\n\n` +
    `⚡ Candles menores = sinais mais frequentes, mais ruído.\n` +
    `📏 Candles maiores = tendências mais confiáveis, menos operações.`;

  return ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buildTimeframeButtons(current, 'set_tf_a', 'setup_strategy_a')),
  });
}

async function timeframeSelectorB(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const current = normalizeTF(config.timeframeB || '4h');
  const token = config.tokenPair?.split('/')[0] || 'TOKEN';

  const text =
    `⏱ <b>Motores &gt; ${config.network} &gt; ${token} &gt; Timeframe — Estratégia B</b>\n\n` +
    `Atual: <code>${current}</code>\n\n` +
    `💡 Estratégia B geralmente atua como filtro de tendência macro.\n` +
    `Recomendado: <code>4h</code> ou <code>1d</code>.`;

  return ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buildTimeframeButtons(current, 'set_tf_b', 'setup_strategy_b')),
  });
}

async function setTimeframe(ctx, strategyField, tf, menuFn) {
  await ctx.answerCbQuery().catch(() => {});
  await prisma.tradeConfig.update({
    where: { id: ctx.session.selectedEngineId },
    data: { [strategyField]: tf },
  });
  await ctx.answerCbQuery(`Timeframe atualizado: ${tf}`);
  return menuFn(ctx);
}

// ---------------------------------------------------------------------------
// RSI Settings menu
// ---------------------------------------------------------------------------
async function setupRsiMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const token = config.tokenPair?.split('/')[0] || 'TOKEN';

  const text =
    `📊 <b>Arena &gt; ${config.network} &gt; ${token} &gt; Sensor RSI</b>\n\n` +
    `O RSI filtra suas bombas para explodirem apenas no timing certo:\n\n` +
    `• <b>RSI &lt; 30</b> — Sobrevendido — Sinal de COMPRA\n` +
    `• <b>RSI &gt; 70</b> — Sobrecomprado — Sinal de VENDA\n` +
    `Status: <b>${config.rsiEnabled ? '🟢 Ativado' : '🔴 Desativado'}</b>   Período: <code>${config.rsiEnabled ? `RSI${config.rsiPeriod}` : '--'}</code>`;

  const buttons = [
    [Markup.button.callback(config.rsiEnabled ? '🔴 Desativar RSI' : '🟢 Ativar RSI', 'toggle_rsi')],
    ...(config.rsiEnabled
      ? [[Markup.button.callback(`📊 Período RSI: ${config.rsiPeriod}`, 'edit_rsiPeriod')]]
      : []
    ),
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function toggleRsi(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  await prisma.tradeConfig.update({
    where: { id: config.id },
    data: { rsiEnabled: !config.rsiEnabled },
  });
  await ctx.answerCbQuery(`RSI ${!config.rsiEnabled ? 'ativado' : 'desativado'}`);
  return setupRsiMenu(ctx);
}

// ---------------------------------------------------------------------------
// Strategy Selector — enable/disable engines A and B
// ---------------------------------------------------------------------------
async function strategySelectorMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const token = config.tokenPair?.split('/')[0] || 'TOKEN';
  const tfA = normalizeTF(config.timeframeA || '30m');
  const tfB = normalizeTF(config.timeframeB || '4h');

  const mark = (active) => active ? '✅' : '⬜';

  const text =
    `🔀 <b>Arena &gt; ${config.network} &gt; ${token} &gt; Modos de Disparo</b>\n\n` +
    `Escolha qual combinação de explosivos será liberada.\n\n` +
    `<b>Explosivo A (${tfA})</b> — Detonação de curto prazo.\n` +
    `<b>Explosivo B (${tfB})</b> — Detonação de longo prazo.\n\n` +
    `Combo (A+B): Bônus de precisão macro!`;

  const bothActive = config.strategy30m && config.strategy4h;
  const noneActive = !config.strategy30m && !config.strategy4h;

  const buttons = [
    [Markup.button.callback(`${mark(noneActive)} Desligado`, 'set_strategy_none')],
    [Markup.button.callback(`${mark(config.strategy30m && !config.strategy4h)} Apenas A (${tfA})`, 'set_strategy_30m')],
    [Markup.button.callback(`${mark(!config.strategy30m && config.strategy4h)} Apenas B (${tfB})`, 'set_strategy_4h')],
    [Markup.button.callback(`${mark(bothActive)} A + B — Combinado (Recomendado)`, 'set_strategy_both')],
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function setStrategyPreset(ctx, s30m, s4h) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  await prisma.tradeConfig.update({ where: { id: config.id }, data: { strategy30m: s30m, strategy4h: s4h } });
  const tfA = normalizeTF(config.timeframeA || '30m');
  const tfB = normalizeTF(config.timeframeB || '4h');
  const label = s30m && s4h ? `A(${tfA}) + B(${tfB})` : s30m ? `Apenas A (${tfA})` : s4h ? `Apenas B (${tfB})` : 'Desligado';
  await ctx.answerCbQuery(`Motor configurado: ${label}`);
  return strategySelectorMenu(ctx);
}

// ---------------------------------------------------------------------------
// Schedule Mode menu
// ---------------------------------------------------------------------------
const INTERVAL_PRESETS = [
  ['5min', 5], ['15min', 15], ['30min', 30], ['1h', 60], ['2h', 120],
  ['4h', 240], ['6h', 360], ['12h', 720], ['24h', 1440],
];

async function setupScheduleMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const token = config.tokenPair?.split('/')[0] || 'TOKEN';
  const mode = config.scheduleMode || 'window';

  const scheduleDesc = mode === 'interval'
    ? `a cada ${formatMinutes(config.intervalMinutes || 60)}`
    : `janelas ${config.window1Min}-${config.window1Max}m / ${config.window2Min}-${config.window2Max}m`;

  const markMode = (m) => m === mode ? '✅' : '⬜';

  const text =
    `⏲️ <b>Arena &gt; ${config.network} &gt; ${token} &gt; Timer de Detonação</b>\n\n` +
    `Modo atual: <b>${mode === 'interval' ? 'Intervalo Fixo ⏱️' : 'Janela Surpresa 🎲'}</b>\n` +
    `Frequência: <code>${scheduleDesc}</code>\n\n` +
    `<b>Janela Surpresa:</b> Executa apenas 1 trade em um minuto surpresa dentro do intervalo escolhido. Ideal para evitar detecção e padrões.\n\n` +
    `<b>Intervalo Fixo:</b> Executa trades de forma recorrente a cada X minutos. Ideal para estratégias de alto volume.`;

  const presetRow1 = INTERVAL_PRESETS.slice(0, 5).map(([label, mins]) => {
    const active = config.intervalMinutes === mins && mode === 'interval';
    return Markup.button.callback(`${active ? '▶' : ''}${label}`, `set_interval_${mins}`);
  });
  const presetRow2 = INTERVAL_PRESETS.slice(5).map(([label, mins]) => {
    const active = config.intervalMinutes === mins && mode === 'interval';
    return Markup.button.callback(`${active ? '▶' : ''}${label}`, `set_interval_${mins}`);
  });

  const buttons = [
    [
      Markup.button.callback(`${markMode('window')} Janelas Aleatórias`, 'set_schedule_window'),
      Markup.button.callback(`${markMode('interval')} Intervalo Fixo`, 'set_schedule_interval'),
    ],
    ...(mode === 'interval'
      ? [
          presetRow1,
          presetRow2,
          [Markup.button.callback('✏️ Intervalo personalizado', 'edit_intervalMinutes')],
        ]
      : [
          [Markup.button.callback('⏰ Configurar Janelas', 'setup_windows')],
        ]
    ),
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function setScheduleMode(ctx, mode) {
  await prisma.tradeConfig.update({
    where: { id: ctx.session.selectedEngineId },
    data: { scheduleMode: mode },
  });
  await ctx.answerCbQuery(`Modo: ${mode === 'interval' ? 'Intervalo Fixo' : 'Janelas Aleatórias'}`);
  return setupScheduleMenu(ctx);
}

async function setIntervalPreset(ctx, minutes) {
  await prisma.tradeConfig.update({
    where: { id: ctx.session.selectedEngineId },
    data: { intervalMinutes: minutes, scheduleMode: 'interval' },
  });
  await ctx.answerCbQuery(`Intervalo: ${formatMinutes(minutes)}`);
  return setupScheduleMenu(ctx);
}

// ---------------------------------------------------------------------------
// Windows menu (used inside schedule window mode)
// ---------------------------------------------------------------------------
async function setupWindowsMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const token = config.tokenPair?.split('/')[0] || 'TOKEN';

  const text =
    `⏰ <b>Motores &gt; ${config.network} &gt; ${token} &gt; Janelas</b>\n` +
    `O bot sorteia um minuto dentro de cada janela para executar.\n\n` +
    `Janela 1: <code>${config.window1Min}–${config.window1Max} min</code>\n` +
    `Janela 2: <code>${config.window2Min}–${config.window2Max} min</code>`;

  const buttons = [
    [Markup.button.callback(`1️⃣ Início: ${config.window1Min}m`, 'edit_window1Min'), Markup.button.callback(`Fim: ${config.window1Max}m`, 'edit_window1Max')],
    [Markup.button.callback(`2️⃣ Início: ${config.window2Min}m`, 'edit_window2Min'), Markup.button.callback(`Fim: ${config.window2Max}m`, 'edit_window2Max')],
    [Markup.button.callback('⬅️ Voltar', 'setup_schedule')],
  ];
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ---------------------------------------------------------------------------
// Pair menu
// ---------------------------------------------------------------------------
async function setupPairMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const text = `💱 <b>Rede e Segurança</b>\nRede: <b>${config.network}</b>\nPar: <b>${config.tokenPair}</b>`;
  const buttons = [
    [Markup.button.callback(`📉 Slippage: ${config.slippage}%`, 'update_slippage')],
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];
  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function selectPairHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { wallet: true } });
  if (!user.wallet) return ctx.answerCbQuery('❌ Configure uma rede primeiro!');

  const configGlobal = require('../../config');
  const network = user.wallet.network.toLowerCase();
  const strategyTokens = configGlobal.strategy.strategyA.tokens;
  const homologatedSymbols = Object.keys(strategyTokens).filter(s => strategyTokens[s]);
  const availableTokens = configGlobal.networks[network]?.tokens || [];
  const targetTokens = availableTokens.filter(t => homologatedSymbols.includes(t.symbol));

  const buttons = targetTokens.map(t => [Markup.button.callback(`💎 ${t.symbol}/USDT`, `set_pair_${t.symbol}/USDT`)]);
  buttons.push([Markup.button.callback('⬅️ Voltar', 'setup_pair_menu')]);

  return ctx.editMessageText(
    `💱 <b>Selecionar Par Homologado:</b>\nAtivos suportados na rede ${user.wallet.network}:`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
}

async function setPairHandler(ctx, pair) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  await prisma.tradeConfig.update({ where: { userId: user.id }, data: { tokenPair: pair } });
  await ctx.answerCbQuery(`Par atualizado para ${pair}`);
  return setupPairMenu(ctx);
}

const { sendUserNotification } = require('../notifier');

// ---------------------------------------------------------------------------
// Start / Stop
// ---------------------------------------------------------------------------
async function startBotHandler(ctx) {
  if (!ctx.session.selectedEngineId) {
    await ctx.answerCbQuery('⚠️ Sessão expirada. Por favor, selecione o motor novamente.', { show_alert: true });
    return tradePanelHandler(ctx);
  }
  const config = await prisma.tradeConfig.findUnique({
    where: { id: ctx.session.selectedEngineId },
    include: { user: { include: { wallet: true } } },
  });
  if (!config.user.wallet) return ctx.answerCbQuery('❌ Configure uma carteira primeiro!', { show_alert: true });

  // Balance check with silent resilient handling
  try {
    const balances = await balanceService.checkBalances(config.user.wallet.publicAddress, config.network);
    if (!balances.hasEnoughGas) return ctx.answerCbQuery('❌ Saldo insuficiente para Gás!', { show_alert: true });
    
    if (balances.isCached) {
      logger.info(`[TradePanel] Starting ${config.network} engine with CACHED balance data.`);
    }
  } catch (err) {
    const isRpcError = err.message?.includes('quorum') || err.message?.includes('bad data') || err.code === 'SERVER_ERROR';
    if (isRpcError) {
      // SILENT RECOVERY: Start anyway if it's an RPC issue, the executor will manage balance
      logger.error(`[TradePanel] Total RPC failure during start: ${err.message}. Starting in autonomous mode.`);
    } else {
      logger.error(`[TradePanel] Critical balance check error:`, err);
      return ctx.answerCbQuery('❌ Erro crítico de sistema. Tente novamente.', { show_alert: true });
    }
  }

  await prisma.tradeConfig.update({ where: { id: config.id }, data: { isOperating: true } });
  await ctx.answerCbQuery('🚀 Motor iniciado!');
  
  // Notification to chat
  const msg = `✅ <b>Motor ${config.network} [${config.tokenPair}] acionado!</b>\n\n` +
               `Iniciando varredura tática e aguardando o próximo sinal de detonação.\n\n` +
               `<i>O sinal de vida foi estabelecido. Operação em curso...</i>`;
  
  await sendUserNotification(ctx.from.id, msg, 'success', 'INFO'); // Category INFO bypasses TRADE filters
  
  return engineConfigHandler(ctx, config.network, config.tokenPair.split('/')[0]);
}

async function stopBotHandler(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  await prisma.tradeConfig.update({ where: { id: config.id }, data: { isOperating: false } });
  await ctx.answerCbQuery('🔴 Motor pausado.');
  return engineConfigHandler(ctx, config.network, config.tokenPair.split('/')[0]);
}

// ---------------------------------------------------------------------------
// Log settings
// ---------------------------------------------------------------------------
async function logSettingsHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  const text =
    `📡 <b>Painel de Logs da Missão</b>\n` +
    `Defina quais dados táticos você deseja receber:\n\n` +
    `📊 <b>Attacks:</b> Notifica execuções de bombas\n` +
    `💰 <b>Loot:</b> Notifica variações de saldo no cofre\n` +
    `🛰️ <b>Scan Mode:</b> Detalhes técnicos de cada frame da operação`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`${user.notifyTrades ? '🟢' : '🔴'} Notificar Trades`, 'toggle_notifyTrades')],
    [Markup.button.callback(`${user.notifyBalances ? '🟢' : '🔴'} Notificar Saldos`, 'toggle_notifyBalances')],
    [Markup.button.callback(`${user.notifySteps ? '🟢' : '🔴'} Passo a Passo (Verbose)`, 'toggle_notifySteps')],
    [Markup.button.callback('⬅️ Voltar', 'trade_panel')],
  ]);

  if (ctx.callbackQuery) return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  return ctx.replyWithHTML(text, keyboard);
}

async function toggleLogPreference(ctx, field) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  const newValue = !user[field];
  await prisma.user.update({ where: { telegramId }, data: { [field]: newValue } });
  await ctx.answerCbQuery(`${field}: ${newValue ? 'LIGADO' : 'DESLIGADO'}`);
  return logSettingsHandler(ctx);
}

async function toggleMev(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const newValue = !config.antiSandwichEnabled;
  await prisma.tradeConfig.update({
    where: { id: config.id },
    data: { antiSandwichEnabled: newValue },
  });
  await ctx.answerCbQuery(`Anti-Sandwich ${newValue ? 'ATIVADO' : 'DESATIVADO'}`);
  return setupSettingsMenu(ctx);
}

// ---------------------------------------------------------------------------
// Advanced Protections & Gas Settings
// ---------------------------------------------------------------------------

async function setupSettingsMenu(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const token = config.tokenPair.split('/')[0];

  const text =
    `🛡️ <b>Arena &gt; ${config.network} &gt; ${token} &gt; Segurança & Gás</b>\n\n` +
    `Reforce as proteções da sua bomba contra ataques de terceiros:\n\n` +
    `• <b>Modo Gás:</b> Define a agressividade do suborno aos validadores.\n` +
    `• <b>Anti-Rug:</b> Tenta abortar trades se detectar remoção de liquidez.\n` +
    `• <b>Auto-Sell:</b> Realiza lucros automaticamente em picos de preço.`;

  const buttons = [
    [Markup.button.callback(`⛽ Gás: ${config.priorityMode || 'Aggressive'}`, 'toggle_priority')],
    [Markup.button.callback(`🎯 Precisão (Slippage): ${config.slippage}%`, 'toggle_slippage')],
    [Markup.button.callback(`${config.antiRugEnabled ? '🟢' : '🔴'} Proteção Anti-Rug`, 'toggle_anti_rug')],
    [Markup.button.callback(`${config.autoSellEnabled ? '🟢' : '🔴'} Auto-Sell (Lucro)`, 'toggle_auto_sell')],
    [Markup.button.callback(`${config.antiSandwichEnabled ? '🟢' : '🔴'} Anti-Sandwich (MEV)`, 'toggle_mev')],
    [Markup.button.callback('⬅️ Voltar', 'manage_engine')],
  ];

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function toggleAntiRug(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const newValue = !config.antiRugEnabled;
  await prisma.tradeConfig.update({ where: { id: config.id }, data: { antiRugEnabled: newValue } });
  await ctx.answerCbQuery(`Anti-Rug: ${newValue ? 'LIGADO' : 'DESLIGADO'}`);
  return setupSettingsMenu(ctx);
}

async function toggleAutoSell(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const newValue = !config.autoSellEnabled;
  await prisma.tradeConfig.update({ where: { id: config.id }, data: { autoSellEnabled: newValue } });
  await ctx.answerCbQuery(`Auto-Sell: ${newValue ? 'LIGADO' : 'DESLIGADO'}`);
  return setupSettingsMenu(ctx);
}

async function togglePriority(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const modes = ['Standard', 'Aggressive'];
  const currentIdx = modes.indexOf(config.priorityMode || 'Aggressive');
  const nextMode = modes[(currentIdx + 1) % modes.length];
  
  await prisma.tradeConfig.update({ where: { id: config.id }, data: { priorityMode: nextMode } });
  await ctx.answerCbQuery(`Gás ajustado para: ${nextMode}`);
  return setupSettingsMenu(ctx);
}

async function toggleSlippage(ctx) {
  const config = await prisma.tradeConfig.findUnique({ where: { id: ctx.session.selectedEngineId } });
  const levels = [0.5, 1.0, 3.0, 5.0];
  const currentIdx = levels.indexOf(config.slippage);
  const nextLevel = levels[(currentIdx + 1) % levels.length] || 1.0;
  
  await prisma.tradeConfig.update({ where: { id: config.id }, data: { slippage: nextLevel } });
  await ctx.answerCbQuery(`Precisão: ${nextLevel}%`);
  return setupSettingsMenu(ctx);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  updateConfigScene,
  tradePanelHandler,
  engineConfigHandler,
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
};
