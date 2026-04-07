const prisma = require('../config/prisma');

/**
 * LEVEL_CONFIG - Curva Invertida do RPG Engine
 * Fase 1 (1-10): Ganho rápido de XP, ganho lento de comissão
 * Fase 2 (11-20): Dificuldade aumenta, ganhos acompanham
 * Fase 3 (21-30): End Game - Ganhos explosivos para líderes
 */
const LEVEL_CONFIG = {};

// Geração Progressiva da Tabela
for (let i = 1; i <= 30; i++) {
  if (i === 1) {
    LEVEL_CONFIG[i] = { xpThreshold: 0, commissionRate: 0.10 };
  } else if (i <= 10) {
    // Nível 2 exige 15 XP. Nível 10 exige 500 XP.
    // Progressão linear aproximada para XP e 0.5% para comissão
    const xp = Math.round(15 + (i - 2) * ( (500 - 15) / 8 ));
    const rate = 0.10 + (i - 1) * 0.005;
    LEVEL_CONFIG[i] = { xpThreshold: xp, commissionRate: parseFloat(rate.toFixed(4)) };
  } else if (i <= 20) {
    // Nível 20 exige 3500 XP. Comissão 30%.
    const xp = Math.round(500 + (i - 10) * ( (3500 - 500) / 10 ));
    const rate = 0.15 + (i - 10) * 0.015;
    LEVEL_CONFIG[i] = { xpThreshold: xp, commissionRate: parseFloat(rate.toFixed(4)) };
  } else {
    // Nível 30 exige 12000 XP. Comissão 50%.
    const xp = Math.round(3500 + (i - 20) * ( (12000 - 3500) / 10 ));
    const rate = 0.30 + (i - 20) * 0.02;
    LEVEL_CONFIG[i] = { xpThreshold: xp, commissionRate: parseFloat(rate.toFixed(4)) };
  }
}

// Pequenos ajustes manuais para garantir as marcas exatas do usuário
LEVEL_CONFIG[10].commissionRate = 0.15;
LEVEL_CONFIG[20].commissionRate = 0.30;
LEVEL_CONFIG[30].commissionRate = 0.50;

/**
 * Injeta XP e verifica se subiu de nível.
 */
async function addXpAndCheckLevelUp(userId, commissionUSD, buyerId, asset, txHash) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const oldLevel = user.level;
  const oldRate = user.commissionRate;
  const newXp = user.xp + parseFloat(commissionUSD);

  // Encontrar o maior nível alcançado pelo novo XP
  let newLevel = 1;
  let newRate = 0.10;
  
  for (let i = 1; i <= 30; i++) {
    if (newXp >= LEVEL_CONFIG[i].xpThreshold) {
      newLevel = i;
      newRate = LEVEL_CONFIG[i].commissionRate;
    } else {
      break;
    }
  }

  // Atualizar Usuário
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      xp: Math.round(newXp * 100) / 100, // Round to 2 decimals
      level: newLevel,
      commissionRate: newRate
    }
  });

  // Gravar no log de comissões
  await prisma.commissionLog.create({
    data: {
      referrerId: userId,
      buyerId: buyerId,
      amountUSD: parseFloat(commissionUSD) / newRate, // Estimativa do valor total da venda
      commission: parseFloat(commissionUSD),
      asset: asset,
      txHash: txHash
    }
  });

  const levelUp = newLevel > oldLevel;
  return {
    levelUp,
    oldLevel,
    newLevel,
    oldRate,
    newRate,
    totalXp: updatedUser.xp
  };
}

/**
 * Retorna os dados do próximo nível
 */
function getNextLevelInfo(currentLevel) {
  const next = currentLevel + 1;
  if (next > 30) return null;
  return LEVEL_CONFIG[next];
}

module.exports = {
  LEVEL_CONFIG,
  addXpAndCheckLevelUp,
  getNextLevelInfo
};
