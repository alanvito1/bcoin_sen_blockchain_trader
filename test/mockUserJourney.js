const prisma = require('../src/config/prisma');
const walletService = require('../src/services/walletService');
const configGlobal = require('../src/config');

async function testUserJourney() {
  const mockTelegramId = BigInt(Math.floor(Date.now() / 1000)); // Unique ID
  console.log(`--- Iniciando Teste de Trilha do Usuário (ID: ${mockTelegramId}) ---`);

  try {
    // 1. Registro (/start)
    console.log('1. Registrando usuário...');
    const user = await prisma.user.upsert({
      where: { telegramId: mockTelegramId },
      update: { isActive: true },
      create: { telegramId: mockTelegramId, username: 'TestUser' }
    });
    console.log('✅ Usuário registrado:', user.id);

    // 2. Aceitar Termos
    console.log('2. Aceitando termos...');
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { hasAcceptedTerms: true }
    });
    console.log('✅ Termos aceitos.');

    // 3. Gerar Carteira
    console.log('3. Gerando nova carteira...');
    const publicAddress = await walletService.generateNewWallet(user.id, 'POLYGON');
    console.log('✅ Carteira gerada:', publicAddress);

    // 4. Configuração de Trade (Painel)
    console.log('4. Configurando parâmetros de trade...');
    const tradeConfig = await prisma.tradeConfig.create({
      data: {
        userId: user.id,
        tokenPair: 'BCOIN/USDT',
        buyAmountA: parseFloat(configGlobal.strategy.strategyA.buyAmount),
        sellAmountA: parseFloat(configGlobal.strategy.strategyA.sellAmount),
        buyAmountB: parseFloat(configGlobal.strategy.strategyB.buyAmount),
        sellAmountB: parseFloat(configGlobal.strategy.strategyB.sellAmount),
        window1Min: configGlobal.scheduler.window1.min,
        window1Max: configGlobal.scheduler.window1.max,
        window2Min: configGlobal.scheduler.window2.min,
        window2Max: configGlobal.scheduler.window2.max,
        slippage: configGlobal.slippage
      }
    });
    console.log('✅ Configuração de trade criada.');

    // 5. Ativar Robô
    console.log('5. Ativando robô...');
    await prisma.tradeConfig.update({
      where: { userId: user.id },
      data: { isOperating: true }
    });
    console.log('✅ Robô em operação.');

    // Verificação Final
    const finalUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallet: true, tradeConfig: true }
    });

    console.log('\n--- Resultado Final ---');
    console.log('Usuário Ativo:', finalUser.isActive);
    console.log('Carteira Vinculada:', !!finalUser.wallet);
    console.log('Robô Operando:', finalUser.tradeConfig.isOperating);
    console.log('✅ TRILHA CONCLUÍDA COM SUCESSO!');

    // Limpeza (opcional, mas bom para não poluir)
    // await prisma.wallet.delete({ where: { userId: user.id } });
    // await prisma.tradeConfig.delete({ where: { userId: user.id } });
    // await prisma.user.delete({ where: { id: user.id } });

  } catch (error) {
    console.error('❌ ERRO NA TRILHA:', error);
    process.exit(1);
  }
}

testUserJourney();
