const path = require("path");
const { getReleasedPokemonData } = require("../lib/releasedPokemonCache");

const cachePath =
  process.env.POGOAPI_RELEASED_CACHE_PATH ||
  path.join(process.cwd(), "data", "pogoapi", "released-pokemon.json");

getReleasedPokemonData({
  allowStale: false,
  cachePath,
  forceRefresh: true,
  includeBootstrap: false,
  strictWrite: true,
  touchWhenUnchanged: false,
})
  .then((cache) => {
    console.log(
      `Released Pokémon cache contains ${cache.dexNumbers.length} entries (${cache.sourceHash || "no source hash"}).`
    );
  })
  .catch((error) => {
    console.error("Failed to update the released Pokémon cache", error);
    process.exitCode = 1;
  });
