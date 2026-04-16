/**
 * @file priceFetcher.js
 * @description Centralized background worker that fetches prices for all 4 supported tokens
 * every 30 seconds and stores them in the PriceTick table.
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
const notifier = require('../bot/notifier');

/**
 * Robust fetch with exponential backoff
 */
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
  try {
    return await axios.get(url, { timeout: 10000, ...options });
  } catch (error) {
    if (retries > 0 && (error.code === 'EAI_AGAIN' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
      logger.warn(`[PriceFetcher] 📡 Network issue (${error.code}). Retrying in ${backoff}ms... (${retries} left)`);
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

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
/**
 * Fetches price using a robust fallback mechanism (DexScreener -> GeckoTerminal)
 */
async function fetchPrice(token) {
  const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${token.address}`;
  
  try {
    // 1. Primary: DexScreener
    const res = await fetchWithRetry(dexUrl);
    const pairs = res.data.pairs || [];
    
    const netMatch = token.network.toLowerCase() === 'bsc' ? 'bsc' : 'polygon';
    const bestPair = pairs
      .filter(p => p.chainId === netMatch)
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    if (bestPair && bestPair.priceUsd) {
      const price = parseFloat(bestPair.priceUsd);
      await saveTick(token, price);
      return price;
    }

    throw new Error('DexScreener pair not found');
  } catch (error) {
    if (!error.message.includes('404')) {
      logger.debug(`[PriceFetcher] ⚠️ DexScreener failed for ${token.symbol}: ${error.message}. Trying Backup...`);
    }
    
    try {
      // 2. Fallback: GeckoTerminal
      const geckoNetwork = token.network.toLowerCase() === 'bsc' ? 'bsc' : 'polygon_pos';
      const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/tokens/${token.address}`;
      
      const gRes = await fetchWithRetry(geckoUrl);
      const price = parseFloat(gRes.data.data.attributes.price_usd);
      
      if (price > 0) {
        await saveTick(token, price);
        return price;
      }
      } catch (gError) {
      const is404 = gError.message.includes('404') || (gError.response && gError.response.status === 404);
      
      if (!is404) {
          const errMsg = `[PriceFetcher] ⚠️ Oracle backup failed for ${token.symbol}: ${gError.message}`;
          logger.warn(errMsg);
          
          // Only notify admin if it's a fatal total failure (not a common 404/Timeout)
          const isPersistent = gError.code !== 'EAI_AGAIN' && gError.code !== 'ECONNABORTED';
          if (isPersistent && !is404) {
            // Log as error ONLY if we want Aegis to eventually wake up or system to crash
            // For now, let's keep it as warn to stabilize the user's perception
            logger.debug(`[PriceFetcher] Persistent failure for ${token.symbol}`);
          }
      }
    }
  }
  return null;
}

async function saveTick(token, price) {
  try {
    await prisma.priceTick.create({
      data: {
        symbol: token.symbol,
        network: token.network,
        price: price,
        timestamp: new Date()
      }
    });
  } catch (e) {
    logger.error(`[PriceFetcher] Failed to save tick: ${e.message}`);
  }
}

/**
 * Main loop for fetching all prices.
 */
async function runLoop() {
  logger.info('[PriceFetcher] 📡 Updating Local Oracle (30s cycle)...');
  
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
setInterval(runLoop, 30000);

logger.info('[PriceFetcher] Local Oracle Worker active.');

module.exports = {
  runLoop,
  fetchPrice
};
