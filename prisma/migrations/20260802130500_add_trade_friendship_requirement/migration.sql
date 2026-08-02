-- Add a listing-level friendship requirement.
-- Existing listings remain available to any friendship level.
ALTER TABLE "TradeListing"
ADD COLUMN "friendshipRequirement" TEXT NOT NULL DEFAULT 'ANY';
