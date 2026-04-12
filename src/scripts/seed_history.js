/**
 * @file seed_history.js
 * @description Utility script for seeding lifetime historical price data into the Local Oracle (Prisma).
 * Fetches data from GeckoTerminal's OHLCV API and performs batched inserts to avoid memory issues.
 * @module scripts/seed_history
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

const TOKENS = [
  { symbol: 'BCOIN/USDT', network: 'BSC', geckoNet: 'bsc', pool: '0x2eebe0c34da9ba65521e98cbaa7d97496d05f489' },
  { symbol: 'SEN/USDT', network: 'BSC', geckoNet: 'bsc', pool: '0xc54aa5694cd8bd419ac3bba11ece94aa6c5f9b01' },
  { symbol: 'BCOIN/USDT', network: 'POLYGON', geckoNet: 'polygon_pos', pool: '0x8b4e00810c927bb1c02dee73d714a31121689ab3' },
  { symbol: 'SEN/USDT', network: 'POLYGON', geckoNet: 'polygon_pos', pool: '0xd6c2de543dd1570315cc0bebcdaea522553b7e2b' }
];

const CHUNK_SIZE = 1000;

async function fetchWithRetry(url, retries = 5, delay = 10000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.get(url, { headers: { 'Accept': 'application/json' } });
    } catch (err) {
      if (err.response && err.response.status === 429 && i < retries - 1) {
        const wait = delay * (i + 1);
        console.warn(`⏳ [Seed] Rate limited (429). Retrying in ${wait/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, wait));
        continue;
      }
      throw err;
    }
  }
}

async function seedLifetime(token) {
  console.log(`\n🚀 [Seed] Starting lifetime backfill for ${token.symbol} on ${token.network}...`);
  
  const url = `https://api.geckoterminal.com/api/v2/networks/${token.geckoNet}/pools/${token.pool}/ohlcv/day?limit=1000&currency=usd`;
  
  try {
    const res = await fetchWithRetry(url);
    const ohlcv = res.data.data.attributes.ohlcv_list || [];
    
    if (ohlcv.length === 0) {
      console.warn(`⚠️ [Seed] No historical data found for ${token.symbol}.`);
      return;
    }

    console.log(`📊 [Seed] Found ${ohlcv.length} days of history. Processing...`);

    const ticks = ohlcv.map(item => ({
      symbol: token.symbol,
      network: token.network,
      price: parseFloat(item[4]), // Close price
      timestamp: new Date(item[0] * 1000)
    }));

    // Batch Insert (Chunks to avoid Memory/DB pressure)
    let inserted = 0;
    for (let i = 0; i < ticks.length; i += CHUNK_SIZE) {
      const chunk = ticks.slice(i, i + CHUNK_SIZE);
      await prisma.priceTick.createMany({
        data: chunk,
        skipDuplicates: true // Avoid duplicates if script runs twice
      });
      inserted += chunk.length;
      console.log(`✅ [Seed] Progress: ${inserted}/${ticks.length} records...`);
    }

    console.log(`✨ [Seed] Finished ${token.symbol} on ${token.network}. Total: ${inserted} ticks.`);
  } catch (err) {
    console.error(`❌ [Seed] Error seeding ${token.symbol}: ${err.message}`);
    if (err.response) console.error(`Response:`, err.response.data);
  }
}

async function main() {
  console.log("🛠️  Initializing Antigravity Seed Engine...");
  
  for (const token of TOKENS) {
    await seedLifetime(token);
    // Be nice to API (Rate limits)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("\n🏁 [Seed] All operations completed. Orbiting local data.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
