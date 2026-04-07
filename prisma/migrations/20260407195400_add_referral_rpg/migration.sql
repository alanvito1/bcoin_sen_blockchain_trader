-- AlterTable
ALTER TABLE "User" ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.10;

-- CreateTable
CREATE TABLE "CommissionLog" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amountUSD" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "asset" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CommissionLog" ADD CONSTRAINT "CommissionLog_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
