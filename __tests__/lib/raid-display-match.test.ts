import {
  normaliseRaidDisplayBossName,
  raidDisplayBossNamesMatch,
} from "../../lib/raid-display-match";

describe("raid display boss matching", () => {
  it("matches a declared Giratina Altered Forme to the Shadow profile name", () => {
    expect(normaliseRaidDisplayBossName("Giratina (Altered Forme)")).toBe(
      "giratina altered",
    );
    expect(
      raidDisplayBossNamesMatch(
        "Giratina (Altered Forme)",
        "Shadow Altered Giratina",
      ),
    ).toBe(true);
  });

  it("does not collapse different Giratina forms", () => {
    expect(
      raidDisplayBossNamesMatch(
        "Giratina (Altered Forme)",
        "Shadow Origin Giratina",
      ),
    ).toBe(false);
  });

  it("still matches Mega prefixes to the declared base boss name", () => {
    expect(raidDisplayBossNamesMatch("Malamar", "Mega Malamar")).toBe(true);
  });

  it("keeps distinct named Mega forms separate", () => {
    expect(raidDisplayBossNamesMatch("Raichu X", "Mega Raichu Y")).toBe(false);
  });
});
