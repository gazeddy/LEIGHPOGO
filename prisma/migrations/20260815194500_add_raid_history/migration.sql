-- CreateTable
CREATE TABLE "RaidBossProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pokemonId" INTEGER,
    "form" TEXT,
    "tier" TEXT,
    "types" TEXT,
    "weaknesses" TEXT,
    "resistances" TEXT,
    "boostedWeather" TEXT,
    "maxUnboostedCp" INTEGER,
    "maxBoostedCp" INTEGER,
    "possibleShiny" BOOLEAN,
    "refreshedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RaidRotation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "boss" TEXT NOT NULL,
    "start" DATETIME NOT NULL,
    "end" DATETIME NOT NULL,
    "startRaw" TEXT NOT NULL,
    "endRaw" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "bossKeys" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RaidBossProfile_key_key" ON "RaidBossProfile"("key");

-- CreateIndex
CREATE INDEX "RaidBossProfile_category_name_idx" ON "RaidBossProfile"("category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RaidRotation_eventId_key" ON "RaidRotation"("eventId");

-- CreateIndex
CREATE INDEX "RaidRotation_category_start_idx" ON "RaidRotation"("category", "start");
