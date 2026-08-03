const fs = require("fs/promises");
const path = require("path");
const prisma = require("./prisma");

const runtimeFilePath = () =>
  process.env.POKEMON_REGIONAL_OVERRIDES_PATH ||
  path.join(process.cwd(), "data", "pokemon-regional-overrides.json");

let databaseUnavailable = false;

function normaliseDexNumber(value) {
  const dexNumber = Number(value);
  return Number.isInteger(dexNumber) && dexNumber > 0 ? dexNumber : null;
}

function optionalNote(value) {
  if (typeof value !== "string") return null;
  const note = value.trim();
  return note ? note.slice(0, 500) : null;
}

function normaliseRegions(value) {
  let values = value;
  if (typeof values === "string") {
    const trimmed = values.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      values = Array.isArray(parsed) ? parsed : trimmed.split(",");
    } catch {
      values = trimmed.split(",");
    }
  }

  if (!Array.isArray(values)) return [];

  const seen = new Set();
  const regions = [];
  for (const item of values) {
    if (typeof item !== "string") continue;
    const region = item.trim().slice(0, 80);
    const key = region.toLowerCase();
    if (!region || seen.has(key)) continue;
    seen.add(key);
    regions.push(region);
    if (regions.length >= 20) break;
  }
  return regions;
}

function normaliseRegionalOverride(value) {
  const dexNumber = normaliseDexNumber(value?.dexNumber);
  if (dexNumber === null || typeof value?.isRegional !== "boolean") return null;

  let createdAt = null;
  let updatedAt = null;
  try {
    if (value.createdAt) createdAt = new Date(value.createdAt).toISOString();
    if (value.updatedAt) updatedAt = new Date(value.updatedAt).toISOString();
  } catch {
    createdAt = null;
    updatedAt = null;
  }

  return {
    dexNumber,
    isRegional: value.isRegional,
    regions: value.isRegional ? normaliseRegions(value.regions) : [],
    note: optionalNote(value.note),
    createdAt,
    updatedAt,
  };
}

function databaseModel() {
  return prisma?.pokemonRegionalOverride;
}

function isUnavailableDatabaseError(error) {
  return (
    !databaseModel()?.findMany ||
    ["P2021", "P2022"].includes(error?.code) ||
    /PokemonRegionalOverride|pokemonRegionalOverride|no such table|does not exist/i.test(
      String(error?.message || "")
    )
  );
}

async function readFileOverrides() {
  try {
    const parsed = JSON.parse(await fs.readFile(runtimeFilePath(), "utf8"));
    return (Array.isArray(parsed) ? parsed : [])
      .map(normaliseRegionalOverride)
      .filter(Boolean)
      .sort((left, right) => left.dexNumber - right.dexNumber);
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeFileOverrides(overrides) {
  const filePath = runtimeFilePath();
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(overrides, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function readPokemonRegionalOverrides() {
  if (!databaseUnavailable) {
    try {
      const overrides = await databaseModel().findMany({
        orderBy: { dexNumber: "asc" },
      });
      return {
        overrides: overrides.map(normaliseRegionalOverride).filter(Boolean),
        storage: "database",
      };
    } catch (error) {
      if (!isUnavailableDatabaseError(error)) throw error;
      databaseUnavailable = true;
      console.warn(
        "Pokémon regional database storage is unavailable; using the JSON fallback",
        error
      );
    }
  }

  return { overrides: await readFileOverrides(), storage: "file" };
}

async function savePokemonRegionalOverride(input) {
  const dexNumber = normaliseDexNumber(input?.dexNumber);
  if (dexNumber === null || typeof input?.isRegional !== "boolean") {
    throw new Error("A valid Pokédex number and regional status are required.");
  }

  const regions = input.isRegional ? normaliseRegions(input.regions) : [];
  const note = optionalNote(input.note);

  if (!databaseUnavailable) {
    try {
      const rawOverride = await databaseModel().upsert({
        where: { dexNumber },
        create: {
          dexNumber,
          isRegional: input.isRegional,
          regions: regions.length ? JSON.stringify(regions) : null,
          note,
        },
        update: {
          isRegional: input.isRegional,
          regions: regions.length ? JSON.stringify(regions) : null,
          note,
        },
      });
      return {
        override: normaliseRegionalOverride(rawOverride),
        storage: "database",
      };
    } catch (error) {
      if (!isUnavailableDatabaseError(error)) throw error;
      databaseUnavailable = true;
      console.warn(
        "Pokémon regional database storage is unavailable; using the JSON fallback",
        error
      );
    }
  }

  const existing = await readFileOverrides();
  const previous = existing.find((override) => override.dexNumber === dexNumber);
  const now = new Date().toISOString();
  const override = {
    dexNumber,
    isRegional: input.isRegional,
    regions,
    note,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  };
  await writeFileOverrides(
    [
      ...existing.filter((item) => item.dexNumber !== dexNumber),
      override,
    ].sort((left, right) => left.dexNumber - right.dexNumber)
  );
  return { override, storage: "file" };
}

async function deletePokemonRegionalOverride(value) {
  const dexNumber = normaliseDexNumber(value);
  if (dexNumber === null) {
    throw new Error("A valid Pokédex number is required.");
  }

  if (!databaseUnavailable) {
    try {
      const result = await databaseModel().deleteMany({ where: { dexNumber } });
      return { deleted: result.count > 0, storage: "database" };
    } catch (error) {
      if (!isUnavailableDatabaseError(error)) throw error;
      databaseUnavailable = true;
      console.warn(
        "Pokémon regional database storage is unavailable; using the JSON fallback",
        error
      );
    }
  }

  const existing = await readFileOverrides();
  const remaining = existing.filter((override) => override.dexNumber !== dexNumber);
  if (remaining.length === existing.length) {
    return { deleted: false, storage: "file" };
  }
  await writeFileOverrides(remaining);
  return { deleted: true, storage: "file" };
}

module.exports = {
  deletePokemonRegionalOverride,
  normaliseRegionalOverride,
  normaliseRegions,
  readPokemonRegionalOverrides,
  savePokemonRegionalOverride,
};
