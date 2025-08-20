/*
  Warnings:

  - Added the required column `symbol` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "KlineInterval" AS ENUM ('M1', 'M5', 'M15', 'H1', 'D1');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "symbol" VARCHAR(10) NOT NULL;

-- CreateTable
CREATE TABLE "kline_base" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(16,4) NOT NULL,
    "high" DECIMAL(16,4) NOT NULL,
    "low" DECIMAL(16,4) NOT NULL,
    "close" DECIMAL(16,4) NOT NULL,
    "volume" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kline_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kline_aggregated" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "interval" "KlineInterval" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(16,4) NOT NULL,
    "high" DECIMAL(16,4) NOT NULL,
    "low" DECIMAL(16,4) NOT NULL,
    "close" DECIMAL(16,4) NOT NULL,
    "volume" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kline_aggregated_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kline_base_symbol_timestamp_idx" ON "kline_base"("symbol", "timestamp");

-- CreateIndex
CREATE INDEX "kline_base_timestamp_idx" ON "kline_base"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "kline_base_symbol_timestamp_key" ON "kline_base"("symbol", "timestamp");

-- CreateIndex
CREATE INDEX "kline_aggregated_symbol_interval_timestamp_idx" ON "kline_aggregated"("symbol", "interval", "timestamp");

-- CreateIndex
CREATE INDEX "kline_aggregated_timestamp_idx" ON "kline_aggregated"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "kline_aggregated_symbol_interval_timestamp_key" ON "kline_aggregated"("symbol", "interval", "timestamp");

-- CreateIndex
CREATE INDEX "orders_symbol_idx" ON "orders"("symbol");
