const { Markup } = require('telegraf');

/**
 * Gamer/Pro Guide Handler
 */
async function manualPanelHandler(ctx) {
  const text = `📖 <b>MANUAL DE OPERAÇÕES: ARENA BOMBERMAN</b> 🕹️\n\n` +
    `Bem-vindo ao comando central, Bomber! Aqui estão os protocolos para dominar a arena e extrair valor máximo dos seus motores.\n\n` +
    `📥 <b>1. DEPOSITANDO GEMAS (Créditos)</b>\n` +
    `• Acesse <b>🎒 Meu Inventário</b> para ver seu endereço (Cofre).\n` +
    `• Envie <b>POLYGON MATIC</b> ou <b>BSC BNB</b> para o gás.\n` +
    `• Carregue <b>USDT, BCOIN ou SEN</b> para operar ou comprar Energy.\n` +
    `• <i>Saques:</i> Exporte sua Private Key e use em uma wallet externa.\n\n` +
    `🚀 <b>2. MOTORES DE EXPLOSÃO (Trading)</b>\n` +
    `• Ative seus motores na <b>🕹️ Arena de Trade</b>.\n` +
    `• <b>Configuração:</b> Defina o montante de compra/venda (Firepower).\n` +
    `• <b>Slippage:</b> Ajuste a tolerância de preço para evitar explosões falhas em mercados voláteis.\n` +
    `• <b>Estratégias:</b> O bot usa cruzamento de médias (MA21) para detectar o melhor timing.\n\n` +
    `🎁 <b>3. MULTIPLAYER (Referral System)</b>\n` +
    `• Recrute players usando seu link único em <b>🎁 Multiplayer</b>.\n` +
    `• <b>XP & Level:</b> Quanto mais seus recrutas operam, mais XP você ganha, subindo de nível.\n` +
    `• <b>Comissão:</b> Ganhe até 50% de comissão instantânea no Split de vendas de Energy.\n\n` +
    `🛡️ <b>4. PROTOCOLO DE SEGURANÇA</b>\n` +
    `• <b>ALERTA CRÍTICO:</b> Use apenas <b>Burner Wallets</b>. Nunca deposite suas economias de vida aqui. Use apenas o capital de risco para a operação atual.\n\n` +
    `<i>"Prepare as bombas, ajuste o radar e boa sorte na Arena!"</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Voltar ao Lobby', 'start_panel')]
  ]);

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  }
  return ctx.replyWithHTML(text, keyboard);
}

module.exports = {
  manualPanelHandler
};
