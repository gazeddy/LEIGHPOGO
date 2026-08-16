CREATE TABLE "UsageEvent" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL,
  "ownerId" INTEGER,
  "path" TEXT,
  "device" TEXT,
  "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_ownerId_fkey" FOREIGN KEY ("ownerId")
    REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "UsageEvent_createdAt_idx"
  ON "UsageEvent"("createdAt");

CREATE INDEX "UsageEvent_type_createdAt_idx"
  ON "UsageEvent"("type", "createdAt");

CREATE INDEX "UsageEvent_ownerId_createdAt_idx"
  ON "UsageEvent"("ownerId", "createdAt");
