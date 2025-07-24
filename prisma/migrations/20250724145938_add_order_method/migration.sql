-- CreateEnum
CREATE TYPE "OrderMethod" AS ENUM ('MARKET', 'LIMIT');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "method" "OrderMethod" NOT NULL DEFAULT 'LIMIT';
