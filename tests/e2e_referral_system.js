const prisma = require('../src/config/prisma');
const levelingService = require('../src/services/levelingService');

/**
 * E2E Referral & RPG Logic Test
 * 
 * Objective: Validate that the referral pyramid correctly distributes XP, 
 * increases levels, and logs commissions accurately.
 */
async function runTest() {
  console.log('🚀 [E2E] Starting Referral & RPG Logic Test...');

  try {
    // 1. Cleanup old test data
    console.log('🧼 Cleaning up test environment...');
    await prisma.commissionLog.deleteMany({
      where: { referrer: { username: { in: ['TestFounder', 'TestRecruit'] } } }
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['TestFounder', 'TestRecruit'] } }
    });

    // 2. Setup Founder (User A)
    console.log('👤 Creating Founder (Level 1, 10% commission)...');
    const founder = await prisma.user.create({
      data: {
        telegramId: 99999001n,
        username: 'TestFounder',
        referralCode: 'FOUNDER123',
        level: 1,
        xp: 0,
        commissionRate: 0.10,
        hasAcceptedTerms: true
      }
    });

    // 3. Setup Recruit (User B)
    console.log('👥 Creating Recruit referred by Founder...');
    const recruit = await prisma.user.create({
      data: {
        telegramId: 99999002n,
        username: 'TestRecruit',
        referredById: founder.id,
        hasAcceptedTerms: true
      }
    });

    // 4. Simulate Purchase #1 ($10 Package)
    // Expected Commission: $10 * 0.10 = $1.00 USD
    // Expected XP: +1.0 XP
    console.log('💳 Simulating $10 purchase by Recruit...');
    const purchaseAmountUSD = 10;
    const assetName = 'USDT';
    const txHash = '0x_test_referral_tx_001';

    // The logic usually resides in executePaymentHandler, but here we test the service directly
    // since we already checked that executePaymentHandler calls it.
    const commissionUSD = purchaseAmountUSD * (founder.commissionRate); // $1.00
    
    console.log(`ℹ️ Calculated Commission: $${commissionUSD.toFixed(2)}`);

    const result1 = await levelingService.addXpAndCheckLevelUp(
      founder.id,
      commissionUSD,
      recruit.id,
      assetName,
      txHash
    );

    // 5. Validation Phase 1
    const updatedFounder = await prisma.user.findUnique({ where: { id: founder.id } });
    console.log(`📊 Founder Stats: XP=${updatedFounder.xp}, Level=${updatedFounder.level}, Rate=${updatedFounder.commissionRate}`);

    if (updatedFounder.xp === 1.0) {
      console.log('✅ XP Correctly added (1.0)');
    } else {
      throw new Error(`❌ XP Mismatch: Expected 1.0, got ${updatedFounder.xp}`);
    }

    // 6. Simulate Massive Purchase to trigger Level Up
    // To reach Level 2, we need 15 XP (defined in levelingService.js)
    // We need $14 more in commission.
    console.log('🌋 Simulating massive purchase to trigger LEVEL UP...');
    const result2 = await levelingService.addXpAndCheckLevelUp(
      founder.id,
      14.1, // Total XP will be 15.1
      recruit.id,
      assetName,
      '0x_test_levelup_tx'
    );

    if (result2.levelUp) {
      console.log(`🎉 SUCCESS! Founder reached LEVEL ${result2.newLevel}! New Commission Rate: ${(result2.newRate * 100).toFixed(1)}%`);
    } else {
      throw new Error('❌ Level Up failed to trigger despite reaching threshold.');
    }

    // 7. Verify Commission Logs
    const logs = await prisma.commissionLog.findMany({ where: { referrerId: founder.id } });
    console.log(`📜 Total Commission Logs: ${logs.length}`);
    if (logs.length === 2) {
      console.log('✅ Commission logs persistence verified.');
    } else {
      throw new Error('❌ Commission logs missing.');
    }

    console.log('\n🏁 [E2E] TEST SUITE COMPLETED SUCCESSFULLY! 🟢');

  } catch (error) {
    console.error('\n💥 [E2E] TEST FAILED:');
    console.error(error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTest();
