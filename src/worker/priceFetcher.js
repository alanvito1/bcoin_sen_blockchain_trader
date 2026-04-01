/**
 * @file priceFetcher.js
 * @description Centralized background worker that fetches prices for all 4 supported tokens
 * every 60 seconds and stores them in the PriceTick table.
 * This strategy drastically reduces API consumption for GeckoTerminal as multiple users
 * now read from a single local source of truth.
 * @module worker/priceFetcher
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();
const logger = require('../utils/logger');

const POOLS = [
  { symbol: 'BCOIN/USDT', network: 'BSC', geckoNetwork: 'bsc', addr: '0x2eebe0c34da9ba65521e98cbaa7d97496d05f489' },
  { symbol: 'SEN/USDT', network: 'BSC', geckoNetwork: 'bsc', addr: '0xbd24be0e527f39954ab4220b3363428935787a34' }, // BSC SEN pool
  { symbol: 'SEN/USDT', network: 'POLYGON', geckoNetwork: 'polygon_pos', addr: '0xd6c2de543dd1570315cc0bebcdaea522553b7e2b' },
  { symbol: 'BCOIN/USDT', network: 'POLYGON', geckoNetwork: 'polygon_pos', addr: '0x64e7c34f0c427301c238b97496d05f4c9c82ec45' } // Polygon BCOIN pool
];

/**
 * Fetches price from GeckoTerminal for a single pool.
 */
async function fetchPrice(pool) {
  const url = `https://api.geckoterminal.com/api/v2/networks/${pool.geckoNetwork}/pools/${pool.addr}`;
  try {
    const res = await axios.get(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    const price = parseFloat(res.data.data.attributes.base_token_price_usd);
    
    if (isNaN(price)) throw new Error(`Invalid price for ${pool.symbol}`);

    await prisma.priceTick.create({
      data: {
        symbol: pool.symbol,
        network: pool.network,
        price: price,
        timestamp: new Date()
      }
    });

    // Keep DB clean: delete ticks older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.priceTick.deleteMany({
      where: { timestamp: { lt: oneDayAgo } }
    });

    return price;
  } catch (error) {
    logger.error(`[PriceFetcher] Error fetching ${pool.symbol} on ${pool.network}: ${error.message}`);
    return null;
  }
}

/**
 * Main loop for fetching all prices.
 */
async function runLoop() {
  logger.info('[PriceFetcher] Starting 60s price collection cycle...');
  
  const results = await Promise.allSettled(POOLS.map(pool => fetchPrice(pool)));
  
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  logger.info(`[PriceFetcher] Cycle complete. Successfully fetched ${successCount}/${POOLS.length} tokens.`);
}

// Run immediately on start, then every 60 seconds
runLoop();
setInterval(runLoop, 60000);

console.log('[PriceFetcher] Decentralized Market Data collector started.');
