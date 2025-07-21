-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_FILLED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "filledQuantity" INTEGER NOT NULL DEFAULT 0;
