-- CreateTable
CREATE TABLE "PokedexEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dexNumber" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PokedexEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PokedexEntry_ownerId_dexNumber_key" ON "PokedexEntry"("ownerId", "dexNumber");
