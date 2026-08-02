const NORMAL_FORM_NAMES = new Set(["normal", "default", ""]);

const EVOLUTION_IDENTITY_KEYS = new Set([
  "pokemon_id",
  "pokemon_name",
  "form",
  "priority",
]);

function toNumber(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function prettyFormName(form) {
  return String(form || "Normal")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compareFormPreference(left, right) {
  const leftForm = String(left?.form || "").toLowerCase();
  const rightForm = String(right?.form || "").toLowerCase();
  const leftScore = NORMAL_FORM_NAMES.has(leftForm) ? 0 : 1;
  const rightScore = NORMAL_FORM_NAMES.has(rightForm) ? 0 : 1;
  return leftScore - rightScore;
}

function formatEvolutionRequirement(key, value) {
  if (value === false || value === null || value === undefined || value === "") {
    return null;
  }

  switch (key) {
    case "candy_required":
      return `${value} Candy`;
    case "item_required":
      return `Use ${value}`;
    case "lure_required":
      return `Near a ${value}`;
    case "no_candy_cost_if_traded":
      return value ? "No Candy cost after trading" : null;
    case "only_evolves_in_daytime":
      return value ? "Evolve during daytime" : null;
    case "only_evolves_in_nighttime":
      return value ? "Evolve during nighttime" : null;
    case "must_be_buddy_to_evolve":
      return value ? "Must be your current buddy" : null;
    case "buddy_distance_required":
      return `Walk ${value} km as your buddy`;
    case "gender_required":
      return `${value} only`;
    default: {
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .replace(/ Required$/i, "");

      return value === true ? label : `${label}: ${value}`;
    }
  }
}

function buildRequirementList(evolution) {
  return Object.entries(evolution)
    .filter(([key]) => !EVOLUTION_IDENTITY_KEYS.has(key))
    .map(([key, value]) => formatEvolutionRequirement(key, value))
    .filter(Boolean);
}

function makeRelationshipKey(relationship) {
  return [
    relationship.pokemonId,
    relationship.form,
    relationship.sourceForm,
    relationship.randomOutcome,
    ...relationship.requirements,
  ].join("|");
}

function addUniqueRelationship(map, pokemonId, relationship) {
  const key = String(pokemonId);
  const current = map.get(key) || [];
  const relationshipKey = makeRelationshipKey(relationship);

  if (!current.some((item) => makeRelationshipKey(item) === relationshipKey)) {
    current.push(relationship);
    map.set(key, current);
  }
}

function hasSpecificEvolutionCondition(evolution) {
  return Object.entries(evolution).some(([key, value]) => {
    if (EVOLUTION_IDENTITY_KEYS.has(key) || key === "candy_required") return false;
    return value !== false && value !== null && value !== undefined && value !== "";
  });
}

function buildEvolutionMaps(evolutionRows) {
  const evolvesTo = new Map();
  const evolvesFrom = new Map();

  for (const source of Array.isArray(evolutionRows) ? evolutionRows : []) {
    const sourceId = Number(source.pokemon_id);
    if (!Number.isInteger(sourceId)) continue;

    const evolutions = Array.isArray(source.evolutions) ? source.evolutions : [];
    const priorityCounts = new Map();

    for (const evolution of evolutions) {
      const priority = evolution.priority ?? "default";
      priorityCounts.set(priority, (priorityCounts.get(priority) || 0) + 1);
    }

    for (const evolution of evolutions) {
      const targetId = Number(evolution.pokemon_id);
      if (!Number.isInteger(targetId)) continue;

      const priority = evolution.priority ?? "default";
      const randomOutcome =
        priorityCounts.get(priority) > 1 && !hasSpecificEvolutionCondition(evolution);
      const requirements = buildRequirementList(evolution);

      addUniqueRelationship(evolvesTo, sourceId, {
        pokemonId: targetId,
        pokemonName: evolution.pokemon_name,
        form: prettyFormName(evolution.form),
        sourceForm: prettyFormName(source.form),
        requirements,
        randomOutcome,
      });

      addUniqueRelationship(evolvesFrom, targetId, {
        pokemonId: sourceId,
        pokemonName: source.pokemon_name,
        form: prettyFormName(source.form),
        sourceForm: prettyFormName(source.form),
        requirements,
        randomOutcome,
      });
    }
  }

  return { evolvesTo, evolvesFrom };
}

function buildTypesByPokemon(typeRows) {
  const rowsByPokemon = new Map();

  for (const row of Array.isArray(typeRows) ? typeRows : []) {
    const pokemonId = Number(row.pokemon_id);
    if (!Number.isInteger(pokemonId)) continue;

    const current = rowsByPokemon.get(String(pokemonId)) || [];
    current.push(row);
    rowsByPokemon.set(String(pokemonId), current);
  }

  const typesByPokemon = new Map();
  for (const [pokemonId, rows] of rowsByPokemon.entries()) {
    const preferred = [...rows].sort(compareFormPreference)[0];
    const types = Array.isArray(preferred?.type) ? preferred.type.filter(Boolean) : [];
    typesByPokemon.set(pokemonId, types);
  }

  return typesByPokemon;
}

function calculateMatchups(pokemonTypes, effectiveness) {
  const attackingTypes = Object.keys(effectiveness || {}).sort();
  const weaknesses = [];
  const resistances = [];

  for (const attackingType of attackingTypes) {
    const multiplier = pokemonTypes.reduce((total, defendingType) => {
      const value = effectiveness?.[attackingType]?.[defendingType];
      return total * toNumber(value);
    }, 1);

    if (multiplier > 1.000001) {
      weaknesses.push({ type: attackingType, multiplier });
    } else if (multiplier < 0.999999) {
      resistances.push({ type: attackingType, multiplier });
    }
  }

  weaknesses.sort((left, right) =>
    right.multiplier === left.multiplier
      ? left.type.localeCompare(right.type)
      : right.multiplier - left.multiplier
  );
  resistances.sort((left, right) =>
    left.multiplier === right.multiplier
      ? left.type.localeCompare(right.type)
      : left.multiplier - right.multiplier
  );

  const offensiveStrengths = pokemonTypes.map((attackingType) => {
    const targets = Object.entries(effectiveness?.[attackingType] || {})
      .map(([type, multiplier]) => ({ type, multiplier: toNumber(multiplier) }))
      .filter(({ multiplier }) => multiplier > 1.000001)
      .sort((left, right) => left.type.localeCompare(right.type));

    return { type: attackingType, targets };
  });

  return { weaknesses, resistances, offensiveStrengths };
}

function buildPokedexInfo(typeRows, effectiveness, evolutionRows) {
  const typesByPokemon = buildTypesByPokemon(typeRows);
  const { evolvesTo, evolvesFrom } = buildEvolutionMaps(evolutionRows);
  const pokemonIds = new Set([
    ...typesByPokemon.keys(),
    ...evolvesTo.keys(),
    ...evolvesFrom.keys(),
  ]);

  const pokemon = {};
  for (const pokemonId of pokemonIds) {
    const types = typesByPokemon.get(pokemonId) || [];
    const matchups = calculateMatchups(types, effectiveness);

    pokemon[pokemonId] = {
      types,
      ...matchups,
      evolvesTo: evolvesTo.get(pokemonId) || [],
      evolvesFrom: evolvesFrom.get(pokemonId) || [],
    };
  }

  return {
    pokemon,
    types: Object.keys(effectiveness || {}).sort(),
  };
}

module.exports = {
  buildPokedexInfo,
  calculateMatchups,
  formatEvolutionRequirement,
};
