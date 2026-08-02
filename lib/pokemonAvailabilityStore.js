const fs = require("fs/promises");
const path = require("path");
const prisma = require("./prisma");

const runtimeFilePath = () =>
  process.env.POKEMON_AVAILABILITY_OVERRIDES_PATH ||
  path.join(process.cwd(), "data", "pokemon-availability-overrides.json");

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

function normaliseOverride(value) {
  const dexNumber = normaliseDexNumber(value?.dexNumber);
  if (dexNumber === null || typeof value?.released !== "boolean") return null;

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
    released: value.released,
    note: optionalNote(value.note),
    createdAt,
    updatedAt,
  };
}

function databaseModel() {
  return prisma?.pokemonAvailabilityOverride;
}

function isUnavailableDatabaseError(error) {
  return (
    !databaseModel()?.findMany ||
    ["P2021", "P2022"].includes(error?.code) ||
    /PokemonAvailabilityOverride|pokemonAvailabilityOverride|no such table|does not exist/i.test(
      String(error?.message || "")
    )
  );
}

async function readFileOverrides() {
  try {
    const parsed = JSON.parse(await fs.readFile(runtimeFilePath(), "utf8"));
    return (Array.isArray(parsed) ? parsed : [])
      .map(normaliseOverride)
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

async function readPokemonAvailabilityOverrides() {
  if (!databaseUnavailable) {
    try {
      const overrides = await databaseModel().findMany({
        orderBy: { dexNumber: "asc" },
      });
      return { overrides, storage: "database" };
    } catch (error) {
      if (!isUnavailableDatabaseError(error)) throw error;
      databaseUnavailable = true;
      console.warn(
        "Pokémon availability database storage is unavailable; using the JSON fallback",
        error
      );
    }
  }

  return { overrides: await readFileOverrides(), storage: "file" };
}

async function savePokemonAvailabilityOverride(input) {
  const dexNumber = normaliseDexNumber(input?.dexNumber);
  if (dexNumber === null || typeof input?.released !== "boolean") {
    throw new Error("A valid Pokédex number and release status are required.");
  }
  const note = optionalNote(input.note);

  if (!databaseUnavailable) {
    try {
      const override = await databaseModel().upsert({
        where: { dexNumber },
        create: { dexNumber, released: input.released, note },
        update: { released: input.released, note },
      });
      return { override, storage: "database" };
    } catch (error) {
      if (!isUnavailableDatabaseError(error)) throw error;
      databaseUnavailable = true;
      console.warn(
        "Pokémon availability database storage is unavailable; using the JSON fallback",
        error
      );
    }
  }

  const existing = await readFileOverrides();
  const previous = existing.find((override) => override.dexNumber === dexNumber);
  const now = new Date().toISOString();
  const override = {
    dexNumber,
    released: input.released,
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

async function deletePokemonAvailabilityOverride(value) {
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
        "Pokémon availability database storage is unavailable; using the JSON fallback",
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
  deletePokemonAvailabilityOverride,
  readPokemonAvailabilityOverrides,
  savePokemonAvailabilityOverride,
};
