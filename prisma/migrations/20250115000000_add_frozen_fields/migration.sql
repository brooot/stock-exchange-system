-- AddColumn
ALTER TABLE "users" ADD COLUMN     "frozenBalance" DECIMAL(16,2) NOT NULL DEFAULT 0.00;

-- AddColumn
ALTER TABLE "positions" ADD COLUMN     "frozenQuantity" INTEGER NOT NULL DEFAULT 0;
