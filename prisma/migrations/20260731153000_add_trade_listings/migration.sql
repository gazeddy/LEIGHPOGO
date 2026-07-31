-- CreateTable
CREATE TABLE "TradeListing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "TradeListing_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeListingItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listingId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "pokemonName" TEXT NOT NULL,
    "shiny" BOOLEAN NOT NULL DEFAULT false,
    "costume" BOOLEAN NOT NULL DEFAULT false,
    "background" BOOLEAN NOT NULL DEFAULT false,
    "dynamax" BOOLEAN NOT NULL DEFAULT false,
    "gigantamax" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    CONSTRAINT "TradeListingItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "TradeListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TradeListing_status_expiresAt_idx" ON "TradeListing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TradeListing_ownerId_createdAt_idx" ON "TradeListing"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "TradeListingItem_listingId_direction_idx" ON "TradeListingItem"("listingId", "direction");
