ALTER TABLE "TradeListingItem" ADD COLUMN "lucky" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TradeListingItem" ADD COLUMN "xxl" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TradeListingItem" ADD COLUMN "xxs" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TradeNotification" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ownerId" INTEGER NOT NULL,
  "listingId" INTEGER NOT NULL,
  "pokemonName" TEXT NOT NULL,
  "modifierSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" DATETIME,
  CONSTRAINT "TradeNotification_ownerId_fkey" FOREIGN KEY ("ownerId")
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TradeNotification_listingId_fkey" FOREIGN KEY ("listingId")
    REFERENCES "TradeListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TradeNotification_ownerId_listingId_pokemonName_key"
  ON "TradeNotification"("ownerId", "listingId", "pokemonName");
CREATE INDEX "TradeNotification_ownerId_readAt_createdAt_idx"
  ON "TradeNotification"("ownerId", "readAt", "createdAt");
