ALTER TABLE "TradeNotification" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'WISHLIST_MATCH';
ALTER TABLE "TradeNotification" ADD COLUMN "matchedTrainerSummary" TEXT;
ALTER TABLE "TradeNotification" ADD COLUMN "matchedTrainerCount" INTEGER NOT NULL DEFAULT 0;
