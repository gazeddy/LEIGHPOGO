-- CreateTable
CREATE TABLE "UserTickerPreference" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "tickerType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserTickerPreference_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTickerPreference_ownerId_tickerType_key" ON "UserTickerPreference"("ownerId", "tickerType");

-- CreateIndex
CREATE INDEX "UserTickerPreference_ownerId_idx" ON "UserTickerPreference"("ownerId");
