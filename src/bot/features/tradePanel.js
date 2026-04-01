/* eslint-disable no-await-in-loop */
'use strict';

const { Markup, Scenes } = require('telegraf');
const prisma = require('../../config/prisma');
const balanceService = require('../../services/balanceService');
const logger = require('../../utils/logger');
const { TIMEFRAME_MAP } = require('../../services/indicator');

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
    await ctx.reply(`📝 <b>Ajustar ${label}:</b>\nEnvie o novo valor (numérico):`, { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      return ctx.reply('❌ Por favor, <b>digite</b> um valor numérico válido (ex: 0.05).', { parse_mode: 'HTML' });
    }

    const { field, label, engineId } = ctx.scene.session.state;
    const value = parseFloat(ctx.message.text.replace(',', '.'));

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
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { tradeConfigs: true, wallet: true },
  });

  const text = '🎮 <b>Motores &gt; Selecionar Ativo</b>\nEscolha qual motor você deseja configurar ou ativar:';

  const getBtnLabel = (network, token) => {
    const cfg = user.tradeConfigs.find(c => c.network === network && c.tokenPair.startsWith(token));
    return `${cfg?.isOperating ? '🟢' : '🔴'} ${network} - ${token}`;
  };

  const buttons = [
    [Markup.button.callback(getBtnLabel('BSC', 'BCOIN'), 'manage_BSC_BCOIN'), Markup.button.callback(getBtnLabel('BSC', 'SEN'), 'manage_BSC_SEN')],
    [Markup.button.callback(getBtnLabel('POLYGON', 'BCOIN'), 'manage_POLYGON_BCOIN'), Markup.button.callback(getBtnLabel('POLYGON', 'SEN'), 'manage_POLYGON_SEN')],
    [Markup.button.callback('⚙️ Configurações de Logs', 'log_settings')],
    [Markup.button.callback('⬅️ Voltar ao Terminal', 'start_panel')],
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
    `⚙️ <b>Motores &gt; ${network} &gt; ${token}</b>\n` +
    `🤖 <b>Status:</b> ${config.isOperating ? '🟢 EM OPERAÇÃO' : '🔴 PAUSADO'}\n\n` +
    `💱 <b>Par:</b> <code>${config.tokenPair}</code>  Slippage: <code>${config.slippage}%</code>\n\n` +
    `📊 <b>Estratégia A</b> [${tfA} | MA${config.maPeriodA}]:  <code>${config.buyAmountA}</code> Buy / <code>${config.sellAmountA}</code> Sell\n` +
    `💎 <b>Estratégia B</b> [${tfB} | MA${config.maPeriodB}]:  <code>${config.buyAmountB}</code> Buy / <code>${config.sellAmountB}</code> Sell\n\n` +
    `⏰ <b>Agendamento:</b> <code>${scheduleLabel}</code>\n` +
    `🔀 <b>Motores:</b> <code>${stratLabel}</code>   📈 ${rsiStr}\n\n` +
    `Escolha uma seção para configurar:`;

  const buttons = [
    [Markup.button.callback(`📊 Estratégia A (${tfA})`, 'setup_strategy_a'), Markup.button.callback(`💎 Estratégia B (${tfB})`, 'setup_strategy_b')],
    [Markup.button.callback('⏰ Agendamento', 'setup_schedule'), Markup.button.callback(`📉 Slippage: ${config.slippage}%`, 'edit_slippage')],
    [Markup.button.callback(`📈 RSI: ${rsiStr}`, 'setup_rsi')],
    [Markup.button.callback(`🔀 Motores: ${stratLabel}`, 'strategy_selector')],
    [config.isOperating
      ? Markup.button.callback('🔴 PAUSAR MOTOR', 'pause_bot')
      : Markup.button.callback('🟢 INICIAR MOTOR', 'start_bot')],
    [Markup.button.callback('⬅️ Voltar à Lista', 'trade_panel')],
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
    `📊 <b>Motores &gt; ${config.network} &gt; ${config.tokenPair.split('/')[0]} &gt; Estratégia A</b>\n` +
    `Status: <b>${config.strategy30m ? '🟢 Ativa' : '🔴 Inativa'}</b>  |  Timeframe: <code>${tfA}</code>  |  MA: <code>MA${config.maPeriodA}</code>\n\n` +
    `Ajuste os parâmetros desta estratégia:`;

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
    `💎 <b>Motores &gt; ${config.network} &gt; ${config.tokenPair.split('/')[0]} &gt; Estratégia B</b>\n` +
    `Status: <b>${config.strategy4h ? '🟢 Ativa' : '🔴 Inativa'}</b>  |  Timeframe: <code>${tfB}</code>  |  MA: <code>MA${config.maPeriodB}</code>\n\n` +
    `Ajuste os parâmetros desta estratégia:`;

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
  const token = config.tokenPair.split('/')[0];

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
  const token = config.tokenPair.split('/')[0];

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
  const token = config.tokenPair.split('/')[0];

  const text =
    `📈 <b>Motores &gt; ${config.network} &gt; ${token} &gt; Configurar RSI</b>\n\n` +
    `O RSI (Índice de Força Relativa) é usado como filtro de entrada:\n\n` +
    `• <b>RSI &lt; 30</b> — Sobrevendido — Confirma sinal de COMPRA\n` +
    `• <b>RSI &gt; 70</b> — Sobrecomprado — Confirma sinal de VENDA\n` +
    `• RSI neutro — Sinal da MA prevalece sem filtro adicional\n\n` +
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
  const token = config.tokenPair.split('/')[0];
  const tfA = normalizeTF(config.timeframeA || '30m');
  const tfB = normalizeTF(config.timeframeB || '4h');

  const mark = (active) => active ? '✅' : '⬜';

  const text =
    `🔀 <b>Motores &gt; ${config.network} &gt; ${token} &gt; Selecionar Estratégias</b>\n\n` +
    `Escolha quais motores estarão <b>ativos</b> para este par.\n\n` +
    `<b>Estratégia A (${tfA})</b> — Sinal de entrada principal.\n` +
    `<b>Estratégia B (${tfB})</b> — Filtro de tendência de longo prazo.\n\n` +
    `Com ambas ativas: o bot só opera quando A e B concordam.`;

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
  const token = config.tokenPair.split('/')[0];
  const mode = config.scheduleMode || 'window';

  const scheduleDesc = mode === 'interval'
    ? `a cada ${formatMinutes(config.intervalMinutes || 60)}`
    : `janelas ${config.window1Min}-${config.window1Max}m / ${config.window2Min}-${config.window2Max}m`;

  const markMode = (m) => m === mode ? '✅' : '⬜';

  const text =
    `⏰ <b>Motores &gt; ${config.network} &gt; ${token} &gt; Agendamento</b>\n\n` +
    `Modo atual: <b>${mode === 'interval' ? 'Intervalo Fixo' : 'Janelas Aleatórias'}</b>\n` +
    `Frequência: <code>${scheduleDesc}</code>\n\n` +
    `<b>Janelas Aleatórias:</b> O bot sorteia minutos dentro de faixas configuradas. Mais discreto, simula comportamento humano.\n\n` +
    `<b>Intervalo Fixo:</b> O bot executa exatamente a cada X minutos. Ideal para scalping ou maior controle de frequência.`;

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
  const token = config.tokenPair.split('/')[0];

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
  const balances = await balanceService.checkBalances(config.user.wallet.publicAddress, config.network);
  if (!balances.hasEnoughGas) return ctx.answerCbQuery('❌ Saldo insuficiente para Gás!', { show_alert: true });

  await prisma.tradeConfig.update({ where: { id: config.id }, data: { isOperating: true } });
  await ctx.answerCbQuery('🚀 Motor iniciado!');
  
  // Notification to chat
  await sendUserNotification(ctx.from.id, `🚀 <b>Motor Ligado:</b> ${config.network} - ${config.tokenPair}\nEstratégia: ${config.strategy30m ? 'A' : ''}${config.strategy30m && config.strategy4h ? ' + ' : ''}${config.strategy4h ? 'B' : ''}`, 'success', 'TRADE');
  
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
    `⚙️ <b>Centro de Notificações</b>\n` +
    `Defina quais logs você deseja receber no chat:\n\n` +
    `📊 <b>Trades:</b> Notifica execuções (Compra/Venda)\n` +
    `💰 <b>Saldos:</b> Notifica variações e resumos\n` +
    '🛰️ <b>Passo a Passo:</b> Detalhes de cada etapa da operação';

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
};
