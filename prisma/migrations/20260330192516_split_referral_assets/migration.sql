/*
  Warnings:

  - You are about to drop the column `referralBalance` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "referralBalance",
ADD COLUMN     "referralBalanceBCOIN" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "referralBalanceSEN" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ADD COLUMN     "referralBalanceUSDT" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
