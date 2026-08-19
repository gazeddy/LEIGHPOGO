ALTER TABLE "PokedexImportJob" ADD COLUMN "notificationReadAt" DATETIME;
ALTER TABLE "PokedexImportJob" ADD COLUMN "pushSentAt" DATETIME;
ALTER TABLE "PokedexImportJob" ADD COLUMN "pushError" TEXT;

CREATE INDEX "PokedexImportJob_ownerId_notificationReadAt_completedAt_idx"
ON "PokedexImportJob"("ownerId", "notificationReadAt", "completedAt");
