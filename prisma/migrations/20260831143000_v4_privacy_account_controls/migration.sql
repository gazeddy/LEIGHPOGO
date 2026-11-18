-- V4 privacy-policy acknowledgement and deleted-account session revocation.
CREATE TABLE "PrivacyAcceptance" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ownerId" INTEGER NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "acceptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyAcceptance_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PrivacyAcceptance_ownerId_policyVersion_key"
  ON "PrivacyAcceptance"("ownerId", "policyVersion");
CREATE INDEX "PrivacyAcceptance_ownerId_acceptedAt_idx"
  ON "PrivacyAcceptance"("ownerId", "acceptedAt");

-- This contains no account name, IGN, friend code or other profile data. It is
-- retained only so stateless JWTs issued before deletion can be rejected.
CREATE TABLE "AccountRevocation" (
  "userId" INTEGER NOT NULL PRIMARY KEY,
  "revokedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
