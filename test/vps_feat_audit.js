const path = require('path');
const fs = require('fs');

console.log('🔍 [Phase 1.3] FEATURE AUDIT (VPS Environment)');

const features = [
    './src/bot/commands/start',
    './src/bot/features/wallet',
    './src/bot/features/tradePanel',
    './src/bot/features/store',
    './src/bot/features/tokenManager',
    './src/bot/features/status',
    './src/bot/commands/admin',
    './src/bot/features/support',
    './src/bot/features/tools',
    './src/bot/features/referral',
    './src/bot/middleware/rateLimit',
    './src/bot/sessionStore'
];

features.forEach(featPath => {
    try {
        console.log(`\n--- Auditing: ${featPath} ---`);
        const fullPath = path.resolve(featPath + '.js');
        if (!fs.existsSync(fullPath)) {
            console.error(`❌ FILE NOT FOUND: ${fullPath}`);
            return;
        }

        const module = require(featPath);
        if (module === undefined || module === null) {
            console.error(`❌ MODULE LOADED AS: ${module}`);
        } else if (typeof module === 'object') {
            const keys = Object.keys(module);
            console.log(`✅ LOADED AS OBJECT. Keys: [${keys.join(', ')}]`);
            keys.forEach(k => {
                if (module[k] === undefined) console.error(`   ⚠️ KEY [${k}] is UNDEFINED`);
            });
        } else if (typeof module === 'function') {
            console.log(`✅ LOADED AS FUNCTION (${module.name || 'anonymous'})`);
        } else {
            console.log(`✅ LOADED AS ${typeof module}`);
        }
    } catch (e) {
        console.error(`💥 CRITICAL ERROR loading ${featPath}:`, e.message);
        console.error(e.stack);
    }
});

console.log('\nAudit complete.');
