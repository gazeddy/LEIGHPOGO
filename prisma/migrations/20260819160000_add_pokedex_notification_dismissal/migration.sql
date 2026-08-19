-- AlterTable
ALTER TABLE "PokedexImportJob" ADD COLUMN "notificationDismissedAt" DATETIME;

-- CreateIndex
CREATE INDEX "PokedexImportJob_ownerId_notificationDismissedAt_completedAt_idx"
ON "PokedexImportJob"("ownerId", "notificationDismissedAt", "completedAt");
