const prisma = require('../config/prisma');
const { sendUserNotification } = require('../bot/notifier');
const logger = require('../utils/logger');

/**
 * Consumes one credit from the user and pauses the bot if balance reaches zero.
 * @param {string} userId - UUID of the user.
 * @param {string} txHash - The transaction hash of the executed trade.
 */
async function consumeCredit(userId, txHash) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tradeConfig: true }
  });

  if (!user) return;

  // Check if user has an active subscription (MRR)
  const hasActiveSubscription = user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date();

  if (hasActiveSubscription) {
    logger.info(`[Billing] User ${userId} has active subscription. No credit deducted.`);
    return;
  }

  // Deduct 1 credit
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { credits: { decrement: 1 } }
  });

  // Kill Switch: Pause if no credits left
  if (updatedUser.credits <= 0) {
    await prisma.tradeConfig.update({
      where: { userId },
      data: { isOperating: false }
    });

    await sendUserNotification(user.telegramId, 
      `🔋 <b>Sua bateria acabou!</b> O robô foi pausado para proteger seu capital. Recarregue na /loja para continuar operando.`, 
      'warning'
    );
    logger.info(`[Billing] Kill switch triggered for user ${userId}. Bot paused.`);
  }
}

module.exports = {
  consumeCredit
};
