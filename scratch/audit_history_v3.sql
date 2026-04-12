-- Trade History Summary for User 1692505402
SELECT 
    COUNT(*) as total,
    type,
    status
FROM "TradeHistory" 
WHERE "userId" = (SELECT id FROM "User" WHERE "telegramId" = 1692505402)
  AND "createdAt" > NOW() - INTERVAL '12 hours'
GROUP BY type, status
ORDER BY total DESC;
