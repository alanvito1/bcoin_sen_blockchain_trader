SELECT 
    tc.network, 
    tc."tokenPair", 
    tc."isOperating", 
    tc."scheduleMode", 
    tc.slippage, 
    tc."priorityMode", 
    tc."antiRugEnabled", 
    tc."autoSellEnabled", 
    tc."lastOperationAt",
    tc."lastOperationWindow",
    u.credits,
    u.xp,
    u.level
FROM "TradeConfig" tc 
JOIN "User" u ON tc."userId" = u.id 
WHERE u."telegramId" = 1692505402;
