/*
  Warnings:

  - You are about to drop the column `friendCode` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `team` on the `User` table after copying it to each existing entry.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trainerName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "team" TEXT NOT NULL DEFAULT 'MYSTIC',
    "ownerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Entry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("code", "createdAt", "id", "ownerId", "team", "trainerName", "updatedAt")
SELECT
    "Entry"."code",
    "Entry"."createdAt",
    "Entry"."id",
    "Entry"."ownerId",
    CASE UPPER(TRIM("User"."team"))
        WHEN 'INSTINCT' THEN 'INSTINCT'
        WHEN 'VALOR' THEN 'VALOR'
        WHEN 'MYSTIC' THEN 'MYSTIC'
        ELSE 'MYSTIC'
    END,
    "Entry"."trainerName",
    "Entry"."updatedAt"
FROM "Entry"
JOIN "User" ON "User"."id" = "Entry"."ownerId";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "ign" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user'
);
INSERT INTO "new_User" ("id", "ign", "name", "password", "role") SELECT "id", "ign", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_ign_key" ON "User"("ign");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
