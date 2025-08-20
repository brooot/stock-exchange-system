/*
  Warnings:

  - You are about to drop the column `isCompleted` on the `trade` table. All the data in the column will be lost.
  - You are about to alter the column `symbol` on the `trade` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(10)`.
  - You are about to alter the column `price` on the `trade` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(10,2)`.
  - A unique constraint covering the columns `[orderId]` on the table `trade` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orderId` to the `trade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `trade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `trade` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'EXECUTED', 'CANCELLED');

-- Step 1: Add optional columns first
ALTER TABLE "trade" 
ADD COLUMN "executedAt" TIMESTAMP(3),
ADD COLUMN "orderId" VARCHAR(20),
ADD COLUMN "status" "TradeStatus" DEFAULT 'PENDING',
ADD COLUMN "totalAmount" DECIMAL(12,2),
ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Step 2: Update existing records with default values
UPDATE "trade" SET 
  "orderId" = 'ORD' || EXTRACT(EPOCH FROM NOW())::bigint || '_' || "id",
  "totalAmount" = "price" * "quantity",
  "updatedAt" = "createdAt",
  "status" = CASE WHEN "isCompleted" = true THEN 'EXECUTED'::"TradeStatus" ELSE 'PENDING'::"TradeStatus" END
WHERE "orderId" IS NULL;

-- Step 3: Make columns NOT NULL and add constraints
ALTER TABLE "trade" 
ALTER COLUMN "orderId" SET NOT NULL,
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "totalAmount" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- Step 4: Drop old column and alter existing columns
ALTER TABLE "trade" 
DROP COLUMN "isCompleted",
ALTER COLUMN "symbol" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "trade_orderId_key" ON "trade"("orderId");

-- CreateIndex
CREATE INDEX "trade_userId_idx" ON "trade"("userId");

-- CreateIndex
CREATE INDEX "trade_symbol_idx" ON "trade"("symbol");

-- CreateIndex
CREATE INDEX "trade_createdAt_idx" ON "trade"("createdAt");

-- CreateIndex
CREATE INDEX "trade_status_idx" ON "trade"("status");
