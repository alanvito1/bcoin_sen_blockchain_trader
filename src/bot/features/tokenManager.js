'use strict';

const { Markup, Scenes } = require('telegraf');
const prisma = require('../../config/prisma');
const { ethers } = require('ethers');
const config = require('../../config');
const logger = require('../../utils/logger');

/**
 * Scene for adding a custom token by Contract Address (CA)
 */
const addTokenScene = new Scenes.WizardScene(
  'ADD_TOKEN_SCENE',
  async (ctx) => {
    const text = `💎 <b>FORJAR NOVO STATUS DE LOOT (CA)</b>\n\n` +
      `Siga as instruções para cadastrar um novo ativo para monitoramento na arena.\n\n` +
      `1️⃣ <b>Selecione o Setor da rede:</b>`;
    
    const buttons = [
      [Markup.button.callback('🟡 Setor BSC (Binance)', 'set_net_BSC')],
      [Markup.button.callback('🟣 Setor Polygon (MATIC)', 'set_net_POLYGON')],
      [Markup.button.callback('❌ Abortar Missão', 'cancel_add')]
    ];

    await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'cancel_add') {
      await ctx.answerCbQuery('Cancelado.');
      await ctx.reply('❌ Operação cancelada.');
      return ctx.scene.leave();
    }

    const network = ctx.callbackQuery?.data.replace('set_net_', '');
    if (!network) return ctx.reply('Por favor, selecione uma rede.');

    ctx.scene.session.state.network = network;
    await ctx.answerCbQuery(`Setor: ${network}`);
    
    await ctx.replyWithHTML(`📝 <b>Setor ${network} sintonizado.</b>\n\nEnvie agora o <b>Código do Contrato (CA)</b> do loot:`);
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) return;
    const text = ctx.message.text.trim();

    // ESCAPE HATCH
    if (text === '/cancel' || text === '/start') {
      await ctx.reply('❌ Operação cancelada.');
      return ctx.scene.leave();
    }

    if (!ethers.isAddress(text)) {
      return ctx.reply('❌ Endereço inválido. Envie um contrato válido (0x...) ou /cancel.');
    }

    const address = text;

    const network = ctx.scene.session.state.network;
    await ctx.reply(`🔍 Escaneando contrato no setor ${network}...`);

    try {
      // 1. Discover Token via Blockchain
      const netKey = network.toLowerCase();
      const rpcUrl = config.networks[netKey].rpc;
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      const abi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
      ];
      
      const contract = new ethers.Contract(address, abi, provider);

      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => "Unknown"),
        contract.symbol().catch(() => "UNKNOWN"),
        contract.decimals().catch(() => 18)
      ]);

      ctx.scene.session.state.tokenData = { address, name, symbol, decimals, network };

      const text = `✅ <b>Loot Identificado com Sucesso!</b>\n` +
        `│ 🏷️ <b>Item:</b> ${name}\n` +
        `│ 💎 <b>Gema:</b> ${symbol}\n` +
        `│ 🔢 <b>Decimais:</b> ${decimals}\n` +
        `│ 🌐 <b>Setor:</b> ${network}\n\n` +
        `Deseja confirmar o cadastro deste item no inventário?`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar Cadastro', 'confirm_save_token')],
        [Markup.button.callback('❌ Cancelar', 'cancel_add')]
      ]);

      await ctx.replyWithHTML(text, keyboard);
      return ctx.wizard.next();
    } catch (err) {
      logger.error(`[TokenManager] Error validating CA ${address}:`, err);
      return ctx.reply('❌ Erro ao validar contrato. Verifique se o endereço e a rede estão corretos.');
    }
  },
  async (ctx) => {
    if (ctx.callbackQuery?.data === 'confirm_save_token') {
      const { address, name, symbol, decimals, network } = ctx.scene.session.state.tokenData;

      try {
        await prisma.customToken.upsert({
          where: { address },
          update: { isActive: true, symbol, name, decimals },
          create: { address, network, symbol, name, decimals }
        });

        await ctx.answerCbQuery('Loot Adicionado!');
        await ctx.reply(`🚀 <b>Item ${symbol} forjado com êxito!</b>\nO radar de gemas agora monitora este ativo. Já pode configurar seu motor.`, { parse_mode: 'HTML' });
        return ctx.scene.leave();
      } catch (err) {
        logger.error(`[TokenManager] Error saving token:`, err);
        return ctx.reply('❌ Erro ao salvar no banco de dados.');
      }
    }
    
    await ctx.reply('❌ Operação cancelada.');
    return ctx.scene.leave();
  }
);

module.exports = {
  addTokenScene
};
