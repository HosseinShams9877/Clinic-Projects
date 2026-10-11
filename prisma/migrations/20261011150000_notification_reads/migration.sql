-- CreateTable
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "principalKind" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifread_principal_key_key" ON "notification_reads"("tenantId", "principalId", "notificationKey");

-- CreateIndex
CREATE INDEX "notifread_tenant_principal_idx" ON "notification_reads"("tenantId", "principalId");

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
