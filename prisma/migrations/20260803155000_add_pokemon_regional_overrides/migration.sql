CREATE TABLE "PokemonRegionalOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dexNumber" INTEGER NOT NULL,
    "isRegional" BOOLEAN NOT NULL DEFAULT false,
    "regions" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "PokemonRegionalOverride_dexNumber_key"
ON "PokemonRegionalOverride"("dexNumber");
