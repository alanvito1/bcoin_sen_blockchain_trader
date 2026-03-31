const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

// Mocking Prisma
const prisma = {
  user: {
    findUnique: async () => ({
      id: 'mock-user-id',
      telegramId: 1692505402n,
      firstName: 'Alan',
      credits: 50,
      notifyTrades: true,
      notifyBalances: true,
      notifySteps: false,
      wallet: { publicAddress: '0x1234567890abcdef1234567890abcdef12345678' },
      tradeConfigs: [
          { id: '1', network: 'BSC', tokenPair: 'BCOIN/USDT', isOperating: true, buyAmountA: 10, sellAmountA: 5 },
          { id: '2', network: 'POLYGON', tokenPair: 'SEN/USDT', isOperating: false, buyAmountA: 5, sellAmountA: 2 }
      ]
    })
  },
  tradeConfig: {
    findUnique: async () => ({
      id: '1',
      network: 'BSC',
      tokenPair: 'BCOIN/USDT',
      isOperating: true,
      buyAmountA: 10,
      sellAmountA: 5,
      slippage: 1,
      strategy30m: true,
      strategy4h: true,
      window1Min: 15,
      window1Max: 29,
      window2Min: 45,
      window2Max: 59
    })
  },
  tradeHistory: {
    count: async () => 150
  }
};

// Mocking AdminService
const AdminService = {
    getDatabaseHealth: async () => ({
        users: 10,
        wallets: 8,
        trades: 150,
        lastTrades: []
    })
};

// Mocking tradeQueue
const tradeQueue = {
    getWaitingCount: async () => 5
};

async function simulateNavigation() {
  console.log('🚀 INICIANDO SIMULAÇÃO DE NAVEGAÇÃO TERMINAL 2026\n');
  
  const ctx = {
    from: { id: 1692505402, first_name: 'Alan' },
    session: {},
    replyWithHTML: (text) => {
        console.log('\n--- 📥 BOT REPLY (HTML) ---');
        console.log(text);
        return Promise.resolve();
    },
    editMessageText: (text) => {
        console.log('\n--- 📝 BOT EDIT MESSAGE ---');
        console.log(text);
        return Promise.resolve();
    }
  };

  // 1. Simular /START
  console.log('>>> Ação: Usuário digita /start');
  const startText = `🛰️ <b>SISTEMA DE TRADING MULTI-CHAIN</b>\n` +
    `Status: <b>ON-LINE</b> | Usuário: <code>Alan</code>\n\n` +
    `┌── <b>[ STATUS DA CONTA ]</b>\n` +
    `│ 🔌 <b>Carteira:</b> <code>0x123456...bcdef</code>\n` +
    `│ 🔋 <b>Bateria:</b> 🔋 <code>50</code> Trades\n` +
    `└── 📡 <b>Rede:</b> <code>Polygon / BSC (Mainnet)</code>\n\n` +
    `┌── <b>[ MOTORES DE EXECUÇÃO ]</b>\n` +
    `│ 🟢 <code>BSC BCOIN </code> : C:10 / V:5\n` +
    `│ 🔴 <code>BSC SEN   </code> : Desativado\n` +
    `│\n` +
    `│ 🔴 <code>POL BCOIN </code> : Desativado\n` +
    `│ 🔴 <code>POL SEN   </code> : Desativado\n` +
    `└── ⚙️ <i>Configure cada motor no painel abaixo:</i>`;
  await ctx.replyWithHTML(startText);

  // 2. Simular Painel de Controle
  console.log('\n>>> Ação: Usuário clica em [🎮 Painel de Controle]');
  const panelText = `🎮 <b>Motores > Selecionar Ativo</b>\nEscolha qual motor você deseja configurar ou ativar:`;
  await ctx.editMessageText(panelText);

  // 3. Simular Configurações de Logs
  console.log('\n>>> Ação: Usuário clica em [⚙️ Configurações de Logs]');
  const logText = `⚙️ <b>Centro de Notificações</b>\n` +
    `Defina quais logs você deseja receber no chat enquanto o robô opera:\n\n` +
    `📊 <b>Trades:</b> Notifica execuções (Compra/Venda)\n` +
    `💰 <b>Saldos:</b> Notifica variações e resumos\n` +
    `🛰️ <b>Passo a Passo:</b> Detalhes de cada etapa da operação\n\n` +
    `🟢 Notificar Trades\n🟢 Notificar Saldos\n🔴 Passo a Passo (Verbose)`;
  await ctx.editMessageText(logText);

  // 4. Simular Painel Admin (se admin)
  console.log('\n>>> Ação: Usuário Admin clica em /admin');
  const adminText = `📊 <b>PROJETOS: BLOCKCHAIN TRADER - ADMIN</b>\n\n` +
    `👥 <b>Usuários:</b>\n- Total: 10\n- Ativos: 8\n\n` +
    `📈 <b>Atividade (24h):</b>\n- Trades: 150\n\n` +
    `🔋 <b>Economia:</b>\n- Créditos em Circulação: 500\n\n` +
    `⚙️ <b>Fila BullMQ:</b>\n- Aguardando: 5 jobs`;
  await ctx.replyWithHTML(adminText);

  console.log('\n✅ SIMULAÇÃO CONCLUÍDA.');
  process.exit(0);
}

simulateNavigation().catch(err => {
    console.error('❌ Erro na simulação:', err);
    process.exit(1);
});
