CREATE TABLE "FriendCodeGrabNotification" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "ownerId" INTEGER NOT NULL,
  "copiedById" INTEGER NOT NULL,
  "entryId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" DATETIME,
  CONSTRAINT "FriendCodeGrabNotification_ownerId_fkey" FOREIGN KEY ("ownerId")
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FriendCodeGrabNotification_copiedById_fkey" FOREIGN KEY ("copiedById")
    REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FriendCodeGrabNotification_entryId_fkey" FOREIGN KEY ("entryId")
    REFERENCES "Entry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FriendCodeGrabNotification_ownerId_readAt_createdAt_idx"
  ON "FriendCodeGrabNotification"("ownerId", "readAt", "createdAt");

CREATE INDEX "FriendCodeGrabNotification_copiedById_entryId_createdAt_idx"
  ON "FriendCodeGrabNotification"("copiedById", "entryId", "createdAt");
