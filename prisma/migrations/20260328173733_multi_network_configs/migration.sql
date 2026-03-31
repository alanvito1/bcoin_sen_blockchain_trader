/*
  Warnings:

  - A unique constraint covering the columns `[userId,network,tokenPair]` on the table `TradeConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TradeConfig_userId_key";

-- AlterTable
ALTER TABLE "TradeConfig" ADD COLUMN     "network" TEXT NOT NULL DEFAULT 'BSC';

-- CreateIndex
CREATE UNIQUE INDEX "TradeConfig_userId_network_tokenPair_key" ON "TradeConfig"("userId", "network", "tokenPair");
