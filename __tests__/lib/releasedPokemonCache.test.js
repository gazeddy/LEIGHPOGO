const {
  CACHE_TTL_MS,
  extractReleasedDexNumbers,
  filterReleasedDexNumbers,
  isCacheFresh,
  normaliseDexNumbers,
} = require("../../lib/releasedPokemonCache");

describe("released Pokémon cache helpers", () => {
  it("extracts sorted unique dex numbers from PogoAPI data", () => {
    const payload = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => {
        const id = index + 1;
        return [String(id), { id, name: `Pokemon ${id}` }];
      })
    );

    payload["101"] = { id: 25, name: "Duplicate Pikachu" };

    const dexNumbers = extractReleasedDexNumbers(payload);

    expect(dexNumbers).toHaveLength(100);
    expect(dexNumbers[0]).toBe(1);
    expect(dexNumbers.at(-1)).toBe(100);
  });

  it("rejects an unexpectedly small release payload", () => {
    expect(() =>
      extractReleasedDexNumbers({
        1: { id: 1, name: "Bulbasaur" },
      })
    ).toThrow("unexpectedly small");
  });

  it("normalises and filters saved values to released dex numbers", () => {
    expect(normaliseDexNumbers([3, "2", 2, 0, -1, "bad", 1])).toEqual([1, 2, 3]);
    expect(filterReleasedDexNumbers([1, 2, 3, 999], [1, 3, 4])).toEqual([1, 3]);
  });

  it("checks the released Pokémon hash once per day", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    const cache = { checkedAt: new Date(now - CACHE_TTL_MS + 1_000).toISOString() };

    expect(CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(isCacheFresh(cache, CACHE_TTL_MS, now)).toBe(true);
    expect(
      isCacheFresh(
        { checkedAt: new Date(now - CACHE_TTL_MS - 1_000).toISOString() },
        CACHE_TTL_MS,
        now
      )
    ).toBe(false);
  });
});
