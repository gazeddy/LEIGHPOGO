const REGION_DEFINITIONS = [
  { region: "Kanto", min: 1, max: 151 },
  { region: "Johto", min: 152, max: 251 },
  { region: "Hoenn", min: 252, max: 386 },
  { region: "Sinnoh", min: 387, max: 493 },
  { region: "Unova", min: 494, max: 649 },
  { region: "Kalos", min: 650, max: 721 },
  { region: "Alola", min: 722, max: 807 },
  { region: "Unknown", min: 808, max: 809 },
  { region: "Galar", min: 810, max: 898 },
  { region: "Hisui", min: 899, max: 905 },
  { region: "Paldea", min: 906, max: 1025 },
];

const IGNORED_EVOLUTION_FORMS = new Set(["shadow", "purified"]);
const NORMAL_FORMS = new Set(["", "normal", "default"]);
const SECOND_MOVE_CANDY_BY_STARDUST = new Map([
  [10_000, 25],
  [50_000, 50],
  [75_000, 75],
  [100_000, 100],
]);
const NON_STANDARD_PVPOKE_FORMS = [
  "shadow",
  "mega",
  "primal",
  "gmax",
  "eternamax",
];

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function prettyForm(value) {
  const form = optionalString(value);
  if (!form || NORMAL_FORMS.has(form.toLowerCase())) return null;

  return form
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function regionForDexNumber(dexNumber) {
  const match = REGION_DEFINITIONS.find(
    ({ min, max }) => dexNumber >= min && dexNumber <= max
  );
  return match?.region || "Other";
}

function normalisePokemonNames(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("POGOAPI returned an invalid Pokémon names payload.");
  }

  const pokemon = Object.entries(payload)
    .map(([key, value]) => {
      const dexNumber = Number(value?.id ?? key);
      const name = optionalString(value?.name);
      if (!Number.isInteger(dexNumber) || dexNumber <= 0 || !name) return null;
      return { dexNumber, name };
    })
    .filter(Boolean)
    .sort((left, right) => left.dexNumber - right.dexNumber);

  if (pokemon.length < 100) {
    throw new Error("POGOAPI Pokémon names payload was unexpectedly small.");
  }

  return pokemon;
}

function formPreference(row) {
  const form = String(row?.form || "").toLowerCase();
  if (NORMAL_FORMS.has(form)) return 0;
  if (IGNORED_EVOLUTION_FORMS.has(form)) return 2;
  return 1;
}

function buildTypesByPokemon(typeRows) {
  const rowsByPokemon = new Map();

  for (const row of Array.isArray(typeRows) ? typeRows : []) {
    const pokemonId = Number(row?.pokemon_id);
    if (!Number.isInteger(pokemonId)) continue;

    const current = rowsByPokemon.get(pokemonId) || [];
    current.push(row);
    rowsByPokemon.set(pokemonId, current);
  }

  const typesByPokemon = new Map();
  for (const [pokemonId, rows] of rowsByPokemon.entries()) {
    const preferred = [...rows].sort(
      (left, right) => formPreference(left) - formPreference(right)
    )[0];
    const types = Array.isArray(preferred?.type)
      ? preferred.type.filter((type) => typeof type === "string" && type.trim())
      : [];
    typesByPokemon.set(pokemonId, types);
  }

  return typesByPokemon;
}

function groupedRows(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  return Object.values(payload).flatMap((rows) =>
    Array.isArray(rows) ? rows : []
  );
}

function buildBuddyDistanceByPokemon(payload) {
  const rowsByPokemon = new Map();

  for (const row of groupedRows(payload)) {
    const pokemonId = Number(row?.pokemon_id);
    if (!Number.isInteger(pokemonId)) continue;

    const current = rowsByPokemon.get(pokemonId) || [];
    current.push(row);
    rowsByPokemon.set(pokemonId, current);
  }

  const distancesByPokemon = new Map();
  for (const [pokemonId, rows] of rowsByPokemon.entries()) {
    const preferred = [...rows].sort(
      (left, right) => formPreference(left) - formPreference(right)
    )[0];
    const distance = Number(preferred?.distance);
    if (Number.isFinite(distance) && distance > 0) {
      distancesByPokemon.set(pokemonId, distance);
    }
  }

  return distancesByPokemon;
}

function pvpokeFormPreference(row) {
  const speciesId = String(row?.speciesId || "").toLowerCase();
  const speciesName = String(row?.speciesName || "").toLowerCase();
  const tags = Array.isArray(row?.tags)
    ? row.tags.map((tag) => String(tag).toLowerCase())
    : [];

  let score = speciesName.includes("(") ? 10 : 0;
  for (const form of NON_STANDARD_PVPOKE_FORMS) {
    if (
      speciesId.includes(`_${form}`) ||
      speciesName.includes(`(${form}`) ||
      tags.includes(form)
    ) {
      score += 100;
    }
  }

  return score;
}

function buildSecondMoveCostByPokemon(rows) {
  const rowsByPokemon = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const pokemonId = Number(row?.dex);
    if (!Number.isInteger(pokemonId)) continue;

    const current = rowsByPokemon.get(pokemonId) || [];
    current.push(row);
    rowsByPokemon.set(pokemonId, current);
  }

  const costsByPokemon = new Map();
  for (const [pokemonId, pokemonRows] of rowsByPokemon.entries()) {
    const preferred = [...pokemonRows].sort(
      (left, right) => pvpokeFormPreference(left) - pvpokeFormPreference(right)
    )[0];
    const stardust = Number(preferred?.thirdMoveCost);
    if (!Number.isFinite(stardust) || stardust <= 0) continue;

    costsByPokemon.set(pokemonId, {
      stardust,
      candy: SECOND_MOVE_CANDY_BY_STARDUST.get(stardust) ?? null,
    });
  }

  return costsByPokemon;
}

function relationshipKey(relationship) {
  return [
    relationship.pokemonId,
    relationship.candyRequired ?? "unknown",
    relationship.noCandyCostIfTraded ? "trade-free" : "standard",
    relationship.sourceForm || "normal",
    relationship.targetForm || "normal",
  ].join("|");
}

function addRelationship(target, relationship) {
  const key = relationshipKey(relationship);
  if (!target.some((current) => relationshipKey(current) === key)) {
    target.push(relationship);
  }
}

function normaliseCandyCost(value) {
  if (value === null || value === undefined || value === "") return null;
  const candy = Number(value);
  return Number.isFinite(candy) && candy >= 0 ? candy : null;
}

function shouldIncludeEvolutionRow(row) {
  const form = String(row?.form || "").toLowerCase();
  return !IGNORED_EVOLUTION_FORMS.has(form);
}

function buildPokedexCatalog(
  namesPayload,
  typeRows,
  evolutionRows,
  buddyDistancePayload,
  pvpokePokemonRows
) {
  const pokemonList = normalisePokemonNames(namesPayload);
  const namesById = new Map(
    pokemonList.map((pokemon) => [pokemon.dexNumber, pokemon.name])
  );
  const typesByPokemon = buildTypesByPokemon(typeRows);
  const buddyDistanceByPokemon = buildBuddyDistanceByPokemon(
    buddyDistancePayload
  );
  const secondMoveCostByPokemon = buildSecondMoveCostByPokemon(
    pvpokePokemonRows
  );
  const pokemon = Object.fromEntries(
    pokemonList.map(({ dexNumber, name }) => [
      dexNumber,
      {
        name,
        types: typesByPokemon.get(dexNumber) || [],
        buddyDistance: buddyDistanceByPokemon.get(dexNumber) ?? null,
        secondMoveCost: secondMoveCostByPokemon.get(dexNumber) ?? null,
        previous: [],
        next: [],
      },
    ])
  );

  for (const source of Array.isArray(evolutionRows) ? evolutionRows : []) {
    if (!shouldIncludeEvolutionRow(source)) continue;

    const sourceId = Number(source?.pokemon_id);
    if (!Number.isInteger(sourceId) || !pokemon[sourceId]) continue;

    const sourceForm = prettyForm(source.form);
    for (const evolution of Array.isArray(source.evolutions)
      ? source.evolutions
      : []) {
      const targetId = Number(evolution?.pokemon_id);
      if (!Number.isInteger(targetId) || !pokemon[targetId]) continue;

      const targetForm = prettyForm(evolution.form);
      const candyRequired = normaliseCandyCost(evolution.candy_required);
      const noCandyCostIfTraded = evolution.no_candy_cost_if_traded === true;

      addRelationship(pokemon[sourceId].next, {
        pokemonId: targetId,
        pokemonName:
          namesById.get(targetId) || evolution.pokemon_name || `#${targetId}`,
        candyRequired,
        noCandyCostIfTraded,
        sourceForm,
        targetForm,
      });

      addRelationship(pokemon[targetId].previous, {
        pokemonId: sourceId,
        pokemonName:
          namesById.get(sourceId) || source.pokemon_name || `#${sourceId}`,
        candyRequired,
        noCandyCostIfTraded,
        sourceForm,
        targetForm,
      });
    }
  }

  for (const details of Object.values(pokemon)) {
    details.previous.sort((left, right) => left.pokemonId - right.pokemonId);
    details.next.sort((left, right) => left.pokemonId - right.pokemonId);
  }

  const regionMap = new Map();
  for (const entry of pokemonList) {
    const region = regionForDexNumber(entry.dexNumber);
    const current = regionMap.get(region) || [];
    current.push(entry);
    regionMap.set(region, current);
  }

  const orderedRegionNames = [
    ...REGION_DEFINITIONS.map(({ region }) => region),
    "Other",
  ];
  const regions = orderedRegionNames
    .filter((region, index) => orderedRegionNames.indexOf(region) === index)
    .map((region) => ({ region, pokemon: regionMap.get(region) || [] }))
    .filter((region) => region.pokemon.length > 0);

  return { regions, pokemon };
}

module.exports = {
  REGION_DEFINITIONS,
  SECOND_MOVE_CANDY_BY_STARDUST,
  buildBuddyDistanceByPokemon,
  buildPokedexCatalog,
  buildSecondMoveCostByPokemon,
  normalisePokemonNames,
  prettyForm,
  regionForDexNumber,
};
