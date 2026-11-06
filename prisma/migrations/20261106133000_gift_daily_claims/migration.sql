-- A user may receive another code from the same batch after the 24-hour cooldown.
DROP INDEX IF EXISTS "GiftCode_batchId_ownerId_key";
CREATE INDEX "GiftCode_ownerId_claimedAt_idx" ON "GiftCode"("ownerId", "claimedAt");
