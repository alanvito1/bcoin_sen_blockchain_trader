/**
 * @file monitorWorker.js
 * @description Background worker that monitors the Transit Wallet for unauthorized transactions.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const prisma = require('../config/prisma');
const { providers } = require('../services/blockchain');
const { getOrCreateTransitWallet } = require('../services/walletService');
const { sendUserNotification } = require('../bot/notifier');
const logger = require('../utils/logger');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

// Aegis Auto-Maintainer (Self-Healing Overlay) - DEACTIVATED
// const aegis = require('../services/aegis/eye');
// aegis.start();

async function checkTransitIntegrity() {
  try {
    const founderWallet = process.env.ADMIN_MASTER_WALLET;
    const { address: coreGatewayAddress } = await getOrCreateTransitWallet();
    
    // O monitor deve focar na Gateway Wallet do Core (a que recebe e faz o split)
    // Se houver uma TRANSIT_WALLET_ADDRESS no env que seja diferente da Founder, monitoramos ela também.
    let transitAddress = coreGatewayAddress;
    const envTransit = process.env.TRANSIT_WALLET_ADDRESS;

    if (envTransit && envTransit.toLowerCase() !== founderWallet.toLowerCase()) {
      transitAddress = envTransit;
    }

    if (!transitAddress) {
      logger.warn('[Monitor] Gateway/Transit address not found. Skipping integrity check.');
      return;
    }

    if (!transitAddress) {
      logger.warn('[Monitor] No Transit Wallet address found to monitor.');
      return;
    }

    const networks = ['bsc', 'polygon'];

    for (const net of networks) {
      const provider = providers[net];
      if (!provider) {
        logger.warn(`[Monitor] Skipping ${net}: Provider not initialized.`);
        continue;
      }

      logger.info(`[Monitor] Checking integrity on ${net.toUpperCase()} for GATEWAY: ${transitAddress}`);
      const currentNonce = await provider.getTransactionCount(transitAddress);
      const secretKey = `TRANSIT_NONCE_${net.toUpperCase()}`;

      const lastNonceSecret = await prisma.systemSecret.findUnique({
        where: { key: secretKey }
      });

      const lastKnownNonce = lastNonceSecret ? parseInt(lastNonceSecret.encryptedValue) : 0;

      if (currentNonce > lastKnownNonce) {
        // Potential unsanctioned transaction detected
        logger.warn(`[Monitor] 🚨 NONCE MISMATCH on ${net}: Chain=${currentNonce}, Known=${lastKnownNonce}`);
        
        if (ADMIN_ID) {
          await sendUserNotification(ADMIN_ID, 
            `🚨 <b>ALERTA DE SEGURANÇA: GATEWAY CORE</b>\n\n` +
            `Detectada atividade não autorizada na <b>Gateway Wallet</b> (${net.toUpperCase()}).\n` +
            `Auditado: <code>${transitAddress}</code>\n\n` +
            `Nonce em Cadeia: ${currentNonce}\n` +
            `Último Nonce Registrado: ${lastKnownNonce}\n\n` +
            `Se você NÃO executou transações manuais no Core, verifique o explorer imediatamente!`, 
            'error'
          );
        }

        // Auto-sync nonce to avoid spam alerts
        await prisma.systemSecret.upsert({
          where: { key: secretKey },
          update: { encryptedValue: currentNonce.toString() },
          create: { key: secretKey, encryptedValue: currentNonce.toString(), iv: '', authTag: '' }
        });
      }
    }
  } catch (error) {
    logger.error(`[Monitor] Error checking transit integrity: ${error.message}`);
  }
}

// Run monitor every 5 minutes
if (process.env.NODE_ENV !== 'test') {
  setInterval(checkTransitIntegrity, 5 * 60 * 1000);
  checkTransitIntegrity(); // Run once at start
}

module.exports = { checkTransitIntegrity };
