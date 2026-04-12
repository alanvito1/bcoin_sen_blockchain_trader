-- Trade History Summary for User 1692505402
SELECT 
    COUNT(*) as total,
    type,
    "isDryRun",
    "network",
    "tokenPair"
FROM "TradeHistory" 
WHERE "userId" = (SELECT id FROM "User" WHERE "telegramId" = 1692505402)
  AND "createdAt" > NOW() - INTERVAL '12 hours'
GROUP BY type, "isDryRun", "network", "tokenPair"
ORDER BY total DESC;

-- Check for any Reverted/Error Status in logs would be better, 
-- but lets see the logs too.
