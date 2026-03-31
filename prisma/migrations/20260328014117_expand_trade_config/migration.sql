-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "subscriptionExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicAddress" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'POLYGON',

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenPair" TEXT NOT NULL,
    "buyAmountA" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "sellAmountA" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "buyAmountB" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "sellAmountB" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "slippage" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "strategy30m" BOOLEAN NOT NULL DEFAULT true,
    "strategy4h" BOOLEAN NOT NULL DEFAULT true,
    "window1Min" INTEGER NOT NULL DEFAULT 15,
    "window1Max" INTEGER NOT NULL DEFAULT 29,
    "window2Min" INTEGER NOT NULL DEFAULT 45,
    "window2Max" INTEGER NOT NULL DEFAULT 59,
    "isOperating" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TradeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "txHash" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "feeUsed" DOUBLE PRECISION NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeConfig_userId_key" ON "TradeConfig"("userId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeConfig" ADD CONSTRAINT "TradeConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeHistory" ADD CONSTRAINT "TradeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
