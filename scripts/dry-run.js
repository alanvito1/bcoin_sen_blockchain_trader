require('dotenv').config();
const { performAllTrades } = require('../src/services/scheduler');
const config = require('../src/config');
const logger = require('../src/utils/logger');

async function test() {
  console.log('\n--- INICIANDO TESTE DE SIMULAÇÃO (DRY RUN) ---');
  
  // Garantir que estamos no modo simulação
  config.strategy.dryRun = true; 
  
  try {
    await performAllTrades();
    console.log('\n--- TESTE FINALIZADO COM SUCESSO ---');
  } catch (error) {
    logger.error('Falha crítica no teste:', error);
  }
  
  process.exit(0);
}

test();
