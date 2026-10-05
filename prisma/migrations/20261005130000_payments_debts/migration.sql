-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN "secretaryDiscountCap" BIGINT;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "debtFollowUpAt" DATETIME;
ALTER TABLE "appointments" ADD COLUMN "debtNextContactAt" DATETIME;
ALTER TABLE "appointments" ADD COLUMN "debtDueDateOverride" DATETIME;
