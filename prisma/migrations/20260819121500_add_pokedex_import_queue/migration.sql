-- CreateTable
CREATE TABLE "PokedexImportJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "totalImages" INTEGER NOT NULL,
    "processedImages" INTEGER NOT NULL DEFAULT 0,
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "PokedexImportJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PokedexImportJob_status_createdAt_idx" ON "PokedexImportJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PokedexImportJob_ownerId_createdAt_idx" ON "PokedexImportJob"("ownerId", "createdAt");
