function normaliseDexNumber(value) {
  const dexNumber = Number(value);
  return Number.isInteger(dexNumber) && dexNumber > 0 ? dexNumber : null;
}

function applyPokemonAvailabilityOverrides(baseDexNumbers, overrides) {
  const released = new Set(
    (Array.isArray(baseDexNumbers) ? baseDexNumbers : [])
      .map(normaliseDexNumber)
      .filter((dexNumber) => dexNumber !== null)
  );

  for (const override of Array.isArray(overrides) ? overrides : []) {
    const dexNumber = normaliseDexNumber(override?.dexNumber);
    if (dexNumber === null || typeof override?.released !== "boolean") continue;

    if (override.released) released.add(dexNumber);
    else released.delete(dexNumber);
  }

  return [...released].sort((left, right) => left - right);
}

function sortPokemonAvailabilityRows(rows, sort = "dex") {
  const values = Array.isArray(rows) ? [...rows] : [];
  const statusDirection = sort === "unreleased" ? 1 : sort === "released" ? -1 : 0;

  return values.sort((left, right) => {
    if (statusDirection !== 0 && left.effectiveReleased !== right.effectiveReleased) {
      return left.effectiveReleased ? statusDirection : -statusDirection;
    }

    return Number(left.dexNumber) - Number(right.dexNumber);
  });
}

module.exports = {
  applyPokemonAvailabilityOverrides,
  normaliseDexNumber,
  sortPokemonAvailabilityRows,
};
