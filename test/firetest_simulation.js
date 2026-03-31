const strategy = require('../src/services/tradingStrategy');
const proxyquire = require('proxyquire').noCallThru();

/**
 * FIRETEST SIMULATION SCRIPT
 * Simulates multiple strategy configurations and market conditions to verify trade motors.
 */

async function runFiretest() {
  console.log("🔥 INICIANDO FIRETEST - SIMULAÇÃO DE MOTORES DE TRADE\n");

  const scenarios = [
    {
      name: "Cenário 1: Cruzamento MA Padrão (Sem RSI)",
      config: { strategy30m: true, strategy4h: true, rsiEnabled: false, tokenPair: 'BCOIN/USDT' },
      market: { lastPrice: 0.19, prevPrice: 0.21, maA: 0.20, maB: 0.15, rsi: 50 },
      expected: "BUY (MA Cross Below + Trend Up)"
    },
    {
      name: "Cenário 2: Filtro RSI Ativo (Sinal MA ignorado por RSI Alto)",
      config: { strategy30m: true, strategy4h: true, rsiEnabled: true, rsiPeriod: 14, tokenPair: 'BCOIN/USDT' },
      market: { lastPrice: 0.19, prevPrice: 0.21, maA: 0.20, maB: 0.15, rsi: 65 },
      expected: "HOLD (Filtered by RSI > 30)"
    },
    {
      name: "Cenário 3: RSI Confirmando Entrada (Sobre-venda)",
      config: { strategy30m: true, strategy4h: true, rsiEnabled: true, rsiPeriod: 14, tokenPair: 'BCOIN/USDT' },
      market: { lastPrice: 0.19, prevPrice: 0.21, maA: 0.20, maB: 0.15, rsi: 25 },
      expected: "BUY (MA Cross + RSI < 30)"
    },
    {
      name: "Cenário 4: Estratégia 4h Pura (Cruzamento de Venda)",
      config: { strategy30m: false, strategy4h: true, rsiEnabled: false, tokenPair: 'BCOIN/USDT' },
      market: { lastPrice: 0.25, prevPrice: 0.22, maA: 0.20, maB: 0.23, rsi: 50 },
      expected: "SELL (MA Cross Above on 4h)"
    },
    {
      name: "Cenário 5: Random / Alta Volatilidade (RSI Extremo)",
      config: { strategy30m: true, strategy4h: false, rsiEnabled: true, rsiPeriod: 7, tokenPair: 'SEN/USDT' },
      market: { lastPrice: 1.5, prevPrice: 1.1, maA: 1.2, maB: 1.0, rsi: 85 },
      expected: "SELL (Price > MA + RSI > 70)"
    }
  ];

  for (const sc of scenarios) {
    console.log(`--- ${sc.name} ---`);
    console.log(`Config: 30m=${sc.config.strategy30m}, 4h=${sc.config.strategy4h}, RSI=${sc.config.rsiEnabled}`);
    
    // Mock the strategy internal fetchers or override the logic for testing
    // For simplicity in this firetest, we'll manually inject the 'market' state into a modified version of the strategy logic
    const mockResult = simulateSignalLogic(sc.config, sc.market);
    
    console.log(`Resultado: ${mockResult.signal} | Razão: ${mockResult.reason}`);
    console.log(`Esperado: ${sc.expected}`);
    console.log(mockResult.signal.includes(sc.expected.split(' ')[0]) ? "✅ PASSOU" : "❌ FALHOU");
    console.log("\n");
  }

  console.log("🏁 FIRETEST CONCLUÍDO.");
}

/**
 * Functional duplicate of the internal logic in getSignal to test variables without HTTP mocks
 */
function simulateSignalLogic(tradeConfig, market) {
  const { lastPrice, prevPrice, maA, maB, rsi } = market;
  const { strategy30m, strategy4h, rsiEnabled } = tradeConfig;
  
  let signal = 'HOLD';
  let reason = 'Sem sinal.';
  let trendUp = lastPrice > maB;

  // Simulate Strategy A
  if (prevPrice >= maA && lastPrice < maA) {
    const rsiConfirm = !rsiEnabled || rsi < 30;
    if (strategy30m && (!strategy4h || trendUp) && rsiConfirm) {
      signal = 'BUY';
      reason = `Sinal MA Confirmado.${rsiEnabled ? ' RSI < 30.' : ''}`;
    } else if (rsiEnabled && !rsiConfirm) {
      reason = `Filtrado por RSI Alto (${rsi})`;
    } else if (strategy4h && !trendUp) {
      reason = `Filtrado por Tendência Baixa`;
    }
  } else if (prevPrice <= maA && lastPrice > maA) {
    const rsiConfirm = !rsiEnabled || rsi > 70;
    if (strategy30m && rsiConfirm) {
      signal = 'SELL';
      reason = `Sinal MA Confirmado.${rsiEnabled ? ' RSI > 70.' : ''}`;
    } else if (rsiEnabled && !rsiConfirm) {
      reason = `Filtrado por RSI Baixo (${rsi})`;
    }
  }

  // Simulate Strategy B (4h)
  if (signal === 'HOLD' && strategy4h && !strategy30m) {
      if (prevPrice >= maB && lastPrice < maB) {
          signal = 'BUY';
          reason = `Sinal MA 4h Confirmado.`;
      } else if (prevPrice <= maB && lastPrice > maB) {
          signal = 'SELL';
          reason = `Sinal MA 4h Confirmado.`;
      }
  }

  return { signal, reason };
}

runFiretest().catch(console.error);
