-- CreateTable
CREATE TABLE "PokemonAvailabilityOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dexNumber" INTEGER NOT NULL,
    "released" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PokemonAvailabilityOverride_dexNumber_key" ON "PokemonAvailabilityOverride"("dexNumber");
