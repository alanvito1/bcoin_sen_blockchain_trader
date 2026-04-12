/**
 * @file priceFetcher.js
 * @description Centralized background worker that fetches prices for all 4 supported tokens
 * every 60 seconds and stores them in the PriceTick table.
 * This strategy drastically reduces API consumption for GeckoTerminal as multiple users
 * now read from a single local source of truth.
 * @module worker/priceFetcher
 */

const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const axios = require('axios');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

// Verified Token Addresses from Whitepaper
const TOKEN_CONFIG = [
  { symbol: 'BCOIN/USDT', network: 'BSC', address: '0x00e1656e45f18ec6747f5a8496fd39b50b38396d' },
  { symbol: 'SEN/USDT', network: 'BSC', address: '0xb43ac9a81eda5a5b36839d5b6fc65606815361b0' },
  { symbol: 'BCOIN/USDT', network: 'POLYGON', address: '0xb2c63830d4478cb331142fac075a39671a5541dc' },
  { symbol: 'SEN/USDT', network: 'POLYGON', address: '0xfe302b8666539d5046cd9aa0707bb327f5f94c22' }
];

/**
 * Fetches price from DexScreener (Best fallback for DEX tokens)
 */
async function fetchPrice(token) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${token.address}`;
  
  try {
    const res = await axios.get(url, { timeout: 10000 });
    
    // DexScreener returns an array of pairs. We find the one with the highest liquidity or the one on the correct network.
    const pairs = res.data.pairs || [];
    if (pairs.length === 0) throw new Error(`No pools found for ${token.symbol} on ${token.network}`);

    // Filter by network (BSC/POLYGON)
    const netMatch = token.network.toLowerCase() === 'bsc' ? 'bsc' : 'polygon';
    const bestPair = pairs
      .filter(p => p.chainId === netMatch)
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    if (!bestPair) throw new Error(`No ${token.network} pair found for ${token.symbol}`);

    const price = parseFloat(bestPair.priceUsd);
    if (isNaN(price)) throw new Error(`Invalid price for ${token.symbol}`);

    await prisma.priceTick.create({
      data: {
        symbol: token.symbol,
        network: token.network,
        price: price,
        timestamp: new Date()
      }
    });

    return price;
  } catch (error) {
    logger.error(`[PriceFetcher] ❌ Error fetching ${token.symbol} on ${token.network}: ${error.message}`);
    return null;
  }
}

/**
 * Main loop for fetching all prices.
 */
async function runLoop() {
  logger.info('[PriceFetcher] 📡 Updating Local Oracle (1 min cycle)...');
  
  const results = await Promise.allSettled(TOKEN_CONFIG.map(token => fetchPrice(token)));
  
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  logger.info(`[PriceFetcher] ✅ Oracle updated: ${successCount}/${TOKEN_CONFIG.length} success.`);
  
  // Cleanup old ticks (Keep 6 months to support daily indicators)
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  await prisma.priceTick.deleteMany({
    where: { timestamp: { lt: sixMonthsAgo } }
  }).catch(() => {});
}

// Run immediately on start, then every 60 seconds
runLoop();
setInterval(runLoop, 60000);

logger.info('[PriceFetcher] Local Oracle Worker active.');

module.exports = {
  runLoop,
  fetchPrice
};
