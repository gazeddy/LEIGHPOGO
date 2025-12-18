-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT,
    "ign" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "friendCode" TEXT,
    "team" TEXT NOT NULL DEFAULT 'MYSTIC'
);
INSERT INTO "new_User" ("id", "ign", "name", "password", "role") SELECT "id", "ign", "name", "password", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_ign_key" ON "User"("ign");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
