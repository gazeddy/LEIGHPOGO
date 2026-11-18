-- Admin gift batches and one unique code allocation per member and batch.
CREATE TABLE "GiftBatch" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "title" TEXT NOT NULL,
 "slug" TEXT NOT NULL,
 "expiresAt" DATETIME NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GiftBatch_slug_key" ON "GiftBatch"("slug");
CREATE INDEX "GiftBatch_expiresAt_idx" ON "GiftBatch"("expiresAt");
CREATE TABLE "GiftCode" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
 "batchId" TEXT NOT NULL,
 "code" TEXT NOT NULL,
 "ownerId" INTEGER,
 "claimedAt" DATETIME,
 CONSTRAINT "GiftCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GiftBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "GiftCode_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GiftCode_code_key" ON "GiftCode"("code");
CREATE UNIQUE INDEX "GiftCode_batchId_ownerId_key" ON "GiftCode"("batchId","ownerId");
CREATE INDEX "GiftCode_batchId_ownerId_idx" ON "GiftCode"("batchId","ownerId");
