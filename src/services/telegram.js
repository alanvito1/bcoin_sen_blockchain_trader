const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Telegram Service
 * Responsible for sending notifications and receiving commands.
 */

class TelegramService {
  constructor(config) {
    this.token = config.token;
    this.chatId = config.chatId;
    this.enabled = !!(this.token && this.chatId);
  }

  /**
   * Sends a message to the configured Telegram chat.
   * @param {string} message - The message to send.
   */
  async sendMessage(message) {
    if (!this.enabled) return;

    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      await axios.post(url, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
      logger.info(`[Telegram] Notificação enviada.`);
    } catch (error) {
      const errorDetail = error.response?.data?.description || error.message;
      logger.error(`[Telegram] Erro ao enviar mensagem: ${errorDetail}`);
    }
  }

  /**
   * Initializes the Telegram bot (polling or webhooks).
   */
  async init() {
    if (!this.enabled) {
      logger.warn('[Telegram] Serviço desabilitado. Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env');
      return;
    }
    
    try {
      await this.sendMessage('<b>🚀 Blockchain Auto-Trader Inicializado</b>\nMonitoramento de mercado ativo.');
      logger.success('[Telegram] Serviço inicializado e notificação enviada.');
    } catch (err) {
      logger.error(`[Telegram] Falha na inicialização: ${err.message}`);
    }
  }
}

let instance = null;

module.exports = {
  init: (config) => {
    instance = new TelegramService(config);
    return instance.init();
  },
  getInstance: () => instance
};
