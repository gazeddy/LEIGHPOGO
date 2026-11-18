-- Independent gift-claim audit: user and batch deletes cannot cascade into it.
CREATE TABLE "GiftClaimAudit" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "giftCodeId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "batchTitle" TEXT NOT NULL,
  "batchExpiresAt" DATETIME NOT NULL,
  "claimantIgn" TEXT NOT NULL,
  "claimantIgnKey" TEXT NOT NULL,
  "claimantUserId" INTEGER,
  "claimedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "GiftClaimAudit_giftCodeId_key" ON "GiftClaimAudit"("giftCodeId");
CREATE UNIQUE INDEX "GiftClaimAudit_code_key" ON "GiftClaimAudit"("code");
CREATE INDEX "GiftClaimAudit_claimantIgnKey_claimedAt_idx" ON "GiftClaimAudit"("claimantIgnKey", "claimedAt");
CREATE INDEX "GiftClaimAudit_claimantUserId_claimedAt_idx" ON "GiftClaimAudit"("claimantUserId", "claimedAt");
CREATE INDEX "GiftClaimAudit_claimedAt_idx" ON "GiftClaimAudit"("claimedAt");

-- Reconstruct all currently identifiable historic claims without changing any
-- issued GiftCode rows. Claims by already-deleted users cannot recover an IGN.
INSERT INTO "GiftClaimAudit"
("giftCodeId", "code", "batchTitle", "batchExpiresAt",
 "claimantIgn", "claimantIgnKey", "claimantUserId", "claimedAt")
SELECT gc."id", gc."code", gb."title", gb."expiresAt",
       COALESCE(u."ign", 'Deleted account'),
       CASE WHEN u."id" IS NOT NULL THEN lower(trim(u."ign"))
            ELSE 'deleted-account-' || CAST(gc."id" AS TEXT) END,
       u."id", gc."claimedAt"
FROM "GiftCode" gc
JOIN "GiftBatch" gb ON gb."id" = gc."batchId"
LEFT JOIN "User" u ON u."id" = gc."ownerId"
WHERE gc."claimedAt" IS NOT NULL;
