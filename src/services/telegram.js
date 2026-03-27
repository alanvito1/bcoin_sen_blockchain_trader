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
      // Logic for sending message via Telegram Bot API
      // Example: fetch(`https://api.telegram.org/bot${this.token}/sendMessage?chat_id=${this.chatId}&text=${encodeURIComponent(message)}`)
      logger.info(`[Telegram] Enviando notificação: ${message.substring(0, 50)}...`);
    } catch (error) {
      logger.error(`[Telegram] Erro ao enviar mensagem: ${error.message}`);
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
    logger.success('[Telegram] Serviço inicializado com sucesso.');
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
