const prisma = require('../src/config/prisma');
const startHandler = require('../src/bot/commands/start');
const logger = require('../src/utils/logger');

async function simulateOnboarding() {
  const TEST_TELEGRAM_ID = 999999999n;
  const TEST_FIRST_NAME = 'TestUser';
  const TEST_USERNAME = 'test_bot_user';

  logger.info('--- Starting Onboarding Simulation ---');

  try {
    // 1. Cleanup existing test user
    await prisma.user.deleteMany({ where: { telegramId: TEST_TELEGRAM_ID } });
    logger.info('Cleaned up previous test user.');

    // 2. Mock Telegraf Context for /start
    const ctx = {
      from: {
        id: Number(TEST_TELEGRAM_ID),
        first_name: TEST_FIRST_NAME,
        username: TEST_USERNAME
      },
      replyWithHTML: (text, extra) => {
        logger.info('Bot replied with HTML (Terms Gate)');
        return Promise.resolve();
      }
    };

    // 3. Trigger /start
    await startHandler(ctx);
    
    // 4. Verify User Creation
    let user = await prisma.user.findUnique({ where: { telegramId: TEST_TELEGRAM_ID } });
    if (user) {
      logger.info(`User created successfully: ID=${user.id}, RefCode=${user.referralCode}, hasAcceptedTerms=${user.hasAcceptedTerms}`);
    } else {
      throw new Error('User was not created!');
    }

    // 5. Simulate Terms Acceptance
    logger.info('Simulating terms acceptance...');
    user = await prisma.user.update({
      where: { telegramId: TEST_TELEGRAM_ID },
      data: { hasAcceptedTerms: true }
    });

    // 6. Trigger /start again (should show main menu)
    const ctxAfterTerms = {
      ...ctx,
      replyWithHTML: (text, extra) => {
        logger.info('Bot replied with HTML (Main Menu)');
        if (text.includes('SISTEMA DE TRADING')) {
          logger.info('Success: Main Menu detected!');
        }
        return Promise.resolve();
      }
    };
    await startHandler(ctxAfterTerms);

    logger.info('--- Onboarding Simulation Completed Successfully ---');
  } catch (error) {
    logger.error('Onboarding Simulation Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

simulateOnboarding();
