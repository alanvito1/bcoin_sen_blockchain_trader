// require('dotenv').config(); // Já carregado no index.js

module.exports = {
  privateKey: process.env.PRIVATE_KEY,
  slippage: parseFloat(process.env.SLIPPAGE || '1.0'), // 1.0 = 1%
  defaultBuyAmount: '1.0',
  defaultSellAmount: '1.0',
  
  // Execution Windows (random minutes per hour)
  scheduler: {
    window1: {
      min: parseInt(process.env.WINDOW1_MIN || '15'),
      max: parseInt(process.env.WINDOW1_MAX || '29')
    },
    window2: {
      min: parseInt(process.env.WINDOW2_MIN || '45'),
      max: parseInt(process.env.WINDOW2_MAX || '59')
    }
  },

  strategy: {
    dryRun: process.env.DRY_RUN === 'true',

    // Strategy A (30m MA21 Grid)
    strategyA: {
      name: 'MA21_30m_Grid',
      enabled: process.env.STRATEGY_A_ENABLED === 'true',
      buyEnabled: process.env.STRATEGY_A_BUY_ENABLED !== 'false', // Default true
      sellEnabled: process.env.STRATEGY_A_SELL_ENABLED !== 'false', // Default true
      maPeriod: parseInt(process.env.MA_PERIOD_A || '21'),
      timeframe: process.env.TIME_FRAME_A || '30',
      buyAmount: process.env.BUY_AMOUNT_A || '1.0',
      sellAmount: process.env.SELL_AMOUNT_A || '1.0',
      tokens: {
        BCOIN: process.env.STRATEGY_A_BCOIN_ENABLED !== 'false',
        SEN: process.env.STRATEGY_A_SEN_ENABLED !== 'false'
      }
    },

    // Strategy B (4h MA21 Grid)
    strategyB: {
      name: 'MA21_4h_Grid',
      enabled: process.env.STRATEGY_B_ENABLED === 'true',
      buyEnabled: process.env.STRATEGY_B_BUY_ENABLED !== 'false',
      sellEnabled: process.env.STRATEGY_B_SELL_ENABLED !== 'false',
      maPeriod: parseInt(process.env.MA_PERIOD_B || '21'),
      timeframe: process.env.TIME_FRAME_B || '4',
      sellAmount: process.env.SELL_AMOUNT_B || '1.0',
      buyAmount: process.env.BUY_AMOUNT_B || '4.0',
      tokens: {
        BCOIN: process.env.STRATEGY_B_BCOIN_ENABLED !== 'false',
        SEN: process.env.STRATEGY_B_SEN_ENABLED !== 'false'
      }
    }
  },

  networks: {
    bsc: {
      chainId: 56,
      rpc: process.env.BSC_RPC || 'https://bsc-dataseed.binance.org,https://bsc-dataseed1.defibit.io,https://bsc-dataseed1.ninicoin.io,https://1rpc.io/bsc,https://rpc.ankr.com/bsc,https://bsc.publicnode.com',
      router: '0x10ed43c718714eb63d5aa57b78b54704e256024e',
      wrappedNative: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      usdt: '0x55d398326f99059fF775485246999027B3197955',
      tokens: [
        { name: 'BCOIN', address: '0x00e1656e45f18ec6747f5a8496fd39b50b38396d', symbol: 'BCOIN', decimals: 18, pool: '0x2eebe0c34da9ba65521e98cbaa7d97496d05f489' },
        { name: 'SEN', address: '0xb43ac9a81eda5a5b36839d5b6fc65606815361b0', symbol: 'SEN', decimals: 18, pool: '0xc54aa5694cd8bd419ac3bba11ece94aa6c5f9b01' }
      ],
      explorerUrl: 'https://bscscan.com',
      explorerApi: process.env.BSCSCAN_API_KEY,
      mevRpc: process.env.BSC_MEV_RPC
    },
    polygon: {
      chainId: 137,
      rpc: process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com,https://polygon-mainnet.public.blastapi.io,https://polygon.llamarpc.com,https://rpc.ankr.com/polygon/public,https://polygon.meowrpc.com,https://polygon.drpc.org,https://1rpc.io/polygon,https://rpc-mainnet.maticvigil.com,https://polygon-rpc.com',
      router: '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff',
      wrappedNative: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
      usdt: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
      tokens: [
        { name: 'BCOIN', address: '0xb2c63830d4478cb331142fac075a39671a5541dc', symbol: 'BCOIN', decimals: 18, pool: '0x8b4e00810c927bb1c02dee73d714a31121689ab3' },
        { name: 'SEN', address: '0xfe302b8666539d5046cd9aa0707bb327f5f94c22', symbol: 'SEN', decimals: 18, pool: '0xd6c2de543dd1570315cc0bebcdaea522553b7e2b' },
        { name: 'USDT', address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', symbol: 'USDT', decimals: 6 }
      ],
      explorerUrl: 'https://polygonscan.com',
      explorerApi: process.env.POLYGONSCAN_API_KEY,
      mevRpc: process.env.POLYGON_MEV_RPC
    }
  },

  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID
  }
};
