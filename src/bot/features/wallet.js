const { Markup, Scenes } = require('telegraf');
const { isHexString } = require('ethers');
const prisma = require('../../config/prisma');
const walletService = require('../../services/walletService');
const balanceService = require('../../services/balanceService');
const encryption = require('../../utils/encryption');

/**
 * Scene for importing a private key
 */
const importWalletScene = new Scenes.WizardScene(
  'IMPORT_WALLET_SCENE',
  async (ctx) => {
    await ctx.reply('🛡️ <b>ESCUDO ATIVADO:</b> Recomendamos usar uma "Burner Wallet". Nunca use seu cofre principal.\n\nPor favor, insira o <b>Código de Acesso (Private Key)</b> abaixo:', { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    
    const text = ctx.message.text.trim();

    // 1. Handle Commands during input
    if (text.startsWith('/')) {
      if (text === '/cancel' || text === '/start') {
        await ctx.reply('❌ Processo de importação interrompido.');
        return ctx.scene.leave();
      }
      return ctx.reply('⚠️ Você está importando uma carteira. Por favor, envie sua <b>Chave Privada</b> ou /cancel para sair.', { parse_mode: 'HTML' });
    }

    try {
      // 2. Delete message containing private key for security
      await ctx.deleteMessage().catch(() => {}); 

      // 3. Simple format validation before hitting service
      const cleanKey = text.startsWith('0x') ? text : `0x${text}`;
      if (!isHexString(cleanKey, 32)) {
        throw new Error('Formato inválido. A chave deve ser um hexadecimal de 64 caracteres.');
      }

      const telegramId = BigInt(ctx.from.id);
      const user = await prisma.user.findUnique({ where: { telegramId } });

      if (!user) throw new Error('Usuário não encontrado.');

      // 4. Import via Service
      const publicAddress = await walletService.importExistingWallet(user.id, cleanKey, 'POLYGON');

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Voltar à Carteira', 'wallet_panel')]
      ]);

      await ctx.reply(`✅ <b>Carteira Importada com Sucesso!</b>\nEndereço: <code>${publicAddress}</code>`, { parse_mode: 'HTML', ...keyboard });
      return ctx.scene.leave();
    } catch (error) {
      await ctx.reply(`❌ <b>Erro na Importação:</b> ${error.message}\n\nTente novamente ou envie /cancel para sair.`, { parse_mode: 'HTML' });
    }
  }
);

/**
 * Scene for disconnecting/deleting a wallet with text confirmation
 */
const disconnectWalletScene = new Scenes.WizardScene(
  'DISCONNECT_WALLET_SCENE',
  async (ctx) => {
    await ctx.reply('⚠️ Para confirmar a exclusão permanente, digite <code>DELETAR</code> abaixo:', { parse_mode: 'HTML' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    
    const text = ctx.message.text.trim().toUpperCase();

    if (text === 'CANCELAR' || text === '/cancel') {
      await ctx.reply('❌ Exclusão cancelada.');
      return ctx.scene.leave();
    }

    if (text !== 'DELETAR') {
      return ctx.reply('❌ Confirmação incorreta. Digite <code>DELETAR</code> para confirmar ou /cancel para sair.', { parse_mode: 'HTML' });
    }

    try {
      const telegramId = BigInt(ctx.from.id);
      const user = await prisma.user.findUnique({ where: { telegramId } });

      await prisma.wallet.delete({ where: { userId: user.id } });
      
      await ctx.reply('🗑️ <b>Carteira removida com sucesso.</b>', { parse_mode: 'HTML' });
      
      // Navigate back to start
      const startHandler = require('../commands/start');
      return startHandler(ctx);
    } catch (error) {
      console.error('[Wallet] Error deleting wallet:', error);
      await ctx.reply('❌ Erro ao remover carteira. Tente novamente.');
      return ctx.scene.leave();
    }
  }
);


/**
 * Wallet Panel Action Handler
 */
/**
 * Wallet Panel Action Handler
 */
async function walletPanelHandler(ctx) {
  try {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ 
      where: { telegramId }, 
      include: { wallet: true } 
    });

    if (!user) {
      return ctx.reply('❌ Usuário não encontrado. Digite /start para se registrar.');
    }

    const buttons = [];
    let text = '';

    if (!user.wallet) {
      text = '💰 <b>Gestão de Inventário</b>\nVocê ainda não possui um cofre vinculado ao seu robô.\n\nEscolha como deseja prosseguir:';
      buttons.push([Markup.button.callback('🎲 Forjar Cofre Automático', 'generate_wallet')]);
      buttons.push([Markup.button.callback('🔑 Importar Key de Acesso', 'import_wallet')]);
      buttons.push([Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]);
    } else {
      // Fetch Multi-Chain Balances
      const multiBalances = await balanceService.getMultiChainBalances(user.wallet.publicAddress);
      
      const creditsDisplay = user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()
        ? '💎 <b>Plano VIP (Energy Infinita)</b>'
        : `🔋 <b>Energy:</b> <code>${user.credits.toLocaleString()}</code> Explosões`;

      text = `💰 <b>Status do Inventário</b>\n` +
        `👤 <b>Badge:</b> ${creditsDisplay}\n` +
        `📍 <b>Endereço do Cofre:</b> <code>${user.wallet.publicAddress}</code>\n\n`;

      // 1. Polygon Section
      const poly = multiBalances.polygon;
      text += `🟣 <b>Setor Polygon (MATIC)</b>\n`;
      if (poly) {
        text += `💰 <b>Gas:</b> ${poly.nativeBalance} ${poly.gasUnit}\n`;
        text += `💎 <b>Loot Disponível:</b>\n`;
        text += `  • SEN: ${poly.tokens.SEN || '0.00'}\n`;
        text += `  • BCOIN: ${poly.tokens.BCOIN || '0.00'}\n`;
        text += `  • USDT: ${poly.tokens.USDT || '0.00'}\n`;
        text += `${poly.hasEnoughGas ? '✅ Gás OK' : '🚨 Gás Baixo'}\n\n`;
      } else {
        text += `❌ Erro ao consultar rede Polygon.\n\n`;
      }

      // 2. BSC Section
      const bsc = multiBalances.bsc;
      text += `🟡 <b>Setor BSC (Binance)</b>\n`;
      if (bsc) {
        text += `💰 <b>Gas:</b> ${bsc.nativeBalance} ${bsc.gasUnit}\n`;
        text += `💎 <b>Loot Disponível:</b>\n`;
        text += `  • SEN: ${bsc.tokens.SEN || '0.00'}\n`;
        text += `  • BCOIN: ${bsc.tokens.BCOIN || '0.00'}\n`;
        text += `  • USDT: ${bsc.tokens.USDT || '0.00'}\n`;
        text += `${bsc.hasEnoughGas ? '✅ Gás OK' : '🚨 Gás Baixo'}\n\n`;
      } else {
        text += `❌ Erro ao consultar rede BSC.\n\n`;
      }

      text += `O que deseja fazer?`;

      buttons.push([Markup.button.callback('🔄 Sync Loot (Atualizar)', 'wallet_panel')]);
      buttons.push([Markup.button.callback('🗑️ Abandonar Loot (Deletar)', 'disconnect_wallet_confirm')]);
      buttons.push([Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]);
    }

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
      return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(() => {});
    }

    return ctx.replyWithHTML(text, keyboard);
  } catch (error) {
    const logger = require('../../utils/logger');
    logger.error('[Wallet] Error in walletPanelHandler:', error);
    return ctx.reply('❌ Ocorreu um erro ao carregar sua carteira. Tente novamente em instantes.');
  }
}

async function generateWalletHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { wallet: true } });
  
  if (user.wallet) return ctx.answerCbQuery('❌ Você já possui uma carteira vinculada.', { show_alert: true });

  // Use POLYGON as default for new users, but this could be based on current context
  await walletService.generateNewWallet(user.id, 'POLYGON');
  
  await ctx.answerCbQuery('✅ Nova Carteira Gerada!', { show_alert: true });
  return walletPanelHandler(ctx);
}

async function disconnectWalletHandler(ctx) {
  const telegramId = BigInt(ctx.from.id);
  const user = await prisma.user.findUnique({ where: { telegramId } });

  await prisma.wallet.delete({ where: { userId: user.id } });
  
  await ctx.answerCbQuery('🗑️ Carteira desconectada com sucesso.', { show_alert: true });
  return startHandler(ctx); // Go back to start because wallet is gone
}

/**
 * Confirmation menu for disconnecting wallet
 */
async function disconnectConfirmHandler(ctx) {
  const text = `⚠️ <b>AVISO CRÍTICO DE SEGURANÇA</b>\n\n` +
    `Você está prestes a desconectar sua carteira do robô.\n\n` +
    `🚨 <b>LEIA COM ATENÇÃO:</b> Se você não possuir a sua <b>Chave Privada (Private Key)</b> salva, você perderá permanentemente o acesso aos seus fundos após a remoção.\n\n` +
    `O robô não guarda cópias após a exclusão. Recomendamos fazer um backup antes de prosseguir.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔑 Fazer Backup (Exibir Chave)', 'view_private_key')],
    [Markup.button.callback('🗑️ Confirmar Exclusão (Remover)', 'disconnect_wallet_force')],
    [Markup.button.callback('❌ Cancelar', 'wallet_panel')]
  ]);

  return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Decrypts and displays the private key for backup
 */
async function viewPrivateKeyHandler(ctx) {
  try {
    const telegramId = BigInt(ctx.from.id);
    const user = await prisma.user.findUnique({ 
      where: { telegramId }, 
      include: { wallet: true } 
    });

    if (!user.wallet) return ctx.answerCbQuery('❌ Nenhuma carteira vinculada.', { show_alert: true });

    const privateKey = encryption.decrypt({
      encryptedData: user.wallet.encryptedPrivateKey,
      iv: user.wallet.iv,
      authTag: user.wallet.authTag
    });

    const text = `🔑 <b>Backup da sua Chave Privada</b>\n\n` +
      `Sua chave privada é:\n<code>${privateKey}</code>\n\n` +
      `⚠️ <b>AVISO DE SEGURANÇA:</b>\n` +
      `• Salve esta chave em um local offline e seguro.\n` +
      `• <b>DELETE ESTA MENSAGEM</b> logo após copiar.\n` +
      `• Com esta chave você pode importar sua carteira em qualquer lugar (Metamask, Trust, etc).`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Voltar', 'disconnect_wallet_confirm')]
    ]);

    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (error) {
    console.error('[Wallet] Error decrypting private key:', error);
    return ctx.answerCbQuery('❌ Erro ao descriptografar chave.', { show_alert: true });
  }
}

module.exports = {
  importWalletScene,
  disconnectWalletScene,
  walletPanelHandler,
  generateWalletHandler,
  disconnectWalletHandler,
  disconnectConfirmHandler,
  viewPrivateKeyHandler
};


