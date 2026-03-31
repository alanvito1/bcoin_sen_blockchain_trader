-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyBalances" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifySteps" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyTrades" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "TradeHistory_userId_createdAt_idx" ON "TradeHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeHistory_status_idx" ON "TradeHistory"("status");

-- CreateIndex
CREATE INDEX "Wallet_publicAddress_idx" ON "Wallet"("publicAddress");
