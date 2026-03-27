require('dotenv').config();
const { start } = require('./src/services/scheduler');
const readline = require('readline');

async function waitExit() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question('\nPrecione ENTER para sair...', () => {
    rl.close();
    resolve();
  }));
}

process.on('uncaughtException', async (err) => {
  console.error('\n❌ EXCEÇÃO NÃO CAPTURADA:');
  console.error(err);
  await waitExit();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('\n❌ REJEIÇÃO NÃO TRATADA:');
  console.error(reason);
  await waitExit();
  process.exit(1);
});

async function main() {
  console.log('--- Blockchain Auto-Trader ---');
  console.log('Verificando ambiente...');

  try {
    if (!process.env.PRIVATE_KEY) {
      console.warn('WARNING: PRIVATE_KEY não encontrada no arquivo .env.');
      console.log('Certifique-se de que o arquivo .env existe na mesma pasta que o .exe');
      await waitExit();
      process.exit(1);
    } else {
      console.log('Carteira carregada com sucesso.');
    }

    // Start the telegram service
    const telegram = require('./src/services/telegram');
    await telegram.init(require('./src/config').telegram);

    // Start the scheduler
    await start();
  } catch (error) {
    console.error('\n❌ ERRO FATAL NA APLICAÇÃO:');
    console.error(error);
    await waitExit();
    process.exit(1);
  }
}

main();
