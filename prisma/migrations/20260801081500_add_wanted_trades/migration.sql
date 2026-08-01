-- CreateTable
CREATE TABLE "WantedTrade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "dexNumber" INTEGER NOT NULL,
    "pokemonName" TEXT NOT NULL,
    "shiny" BOOLEAN NOT NULL DEFAULT false,
    "xxl" BOOLEAN NOT NULL DEFAULT false,
    "xxs" BOOLEAN NOT NULL DEFAULT false,
    "costume" BOOLEAN NOT NULL DEFAULT false,
    "background" BOOLEAN NOT NULL DEFAULT false,
    "dynamax" BOOLEAN NOT NULL DEFAULT false,
    "gigantamax" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WantedTrade_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WantedTrade_pokemonName_createdAt_idx" ON "WantedTrade"("pokemonName", "createdAt");

-- CreateIndex
CREATE INDEX "WantedTrade_ownerId_createdAt_idx" ON "WantedTrade"("ownerId", "createdAt");
