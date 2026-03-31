const cron = require('node-cron');
const prisma = require('../config/prisma');
const { sendUserNotification } = require('../bot/notifier');
const paymentService = require('../services/paymentService');

/**
 * Billing Cron: Runs daily to check for expiring subscriptions.
 */
const billingCron = cron.schedule('0 10 * * *', async () => {
  console.log('[BillingCron] Running daily subscription check...');

  try {
    const today = new Date();
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(today.getDate() + 2);

    // 1. Notify users about to expire (in 2 days)
    const expiringSoon = await prisma.user.findMany({
      where: {
        subscriptionExpiresAt: {
          gte: today,
          lte: twoDaysFromNow
        }
      }
    });

    for (const user of expiringSoon) {
      await sendUserNotification(user.telegramId, 
        `⏳ <b>Sua assinatura vence em 2 dias!</b> Mantenha saldo suficiente na sua carteira para renovação automática ou recarregue na /loja.`, 
        'warning'
      );
    }

    // 2. Handle Renewals (Mocked Logic - would attempt paymentService call)
    // In a real scenario, you'd iterate through users whose subscription expired TODAY
    // and attempt auto-billing using paymentService.processCheckout.

  } catch (error) {
    console.error('[BillingCron] Error:', error);
  }
});

module.exports = billingCron;
