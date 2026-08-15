const {
  selectCurrentRaidBosses,
  selectNextRaidBosses,
} = require("../../lib/event-selection");
const { calculateTypeMatchups } = require("../../lib/raid-detail-source");

function raidEvent({ id, name, start, end }) {
  return {
    eventID: id,
    name,
    eventType: "raid-battles",
    heading: "Raids",
    link: null,
    image: null,
    start,
    end,
  };
}

describe("raid rotation visibility", () => {
  const groudon = raidEvent({
    id: "groudon",
    name: "Groudon in 5-star Raid Battles",
    start: "2026-08-12T10:00:00.000",
    end: "2026-08-19T09:59:59.000",
  });
  const lunala = raidEvent({
    id: "lunala",
    name: "Lunala in 5-star Raid Battles",
    start: "2026-08-19T10:00:00.000",
    end: "2026-08-26T10:00:00.000",
  });

  it("keeps the next five-star boss hidden until the final 24 hours", () => {
    expect(
      selectNextRaidBosses([groudon, lunala], new Date("2026-08-18T09:59:59.000Z")),
    ).toEqual([]);
  });

  it("shows only announcement metadata once the next boss is within 24 hours", () => {
    const next = selectNextRaidBosses(
      [groudon, lunala],
      new Date("2026-08-18T10:00:00.000Z"),
    );

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      eventID: "lunala",
      boss: "Lunala",
      category: "five-star",
      label: "5★",
      state: "next",
      start: "2026-08-19T10:00:00.000",
    });
    expect(next[0]).not.toHaveProperty("catchCp");
  });

  it("promotes the new boss to current at its start time", () => {
    const current = selectCurrentRaidBosses(
      [groudon, lunala],
      new Date("2026-08-19T10:00:00.000Z"),
    );
    expect(current.map((item) => item.boss)).toContain("Lunala");
  });
});

describe("raid type matchups", () => {
  it("multiplies effectiveness across dual types to identify double weaknesses", () => {
    const table = {
      Ice: { Dragon: "1.6", Flying: "1.6" },
      Rock: { Dragon: "1", Flying: "1.6" },
      Grass: { Dragon: "0.625", Flying: "0.625" },
      Normal: { Dragon: "1", Flying: "1" },
    };

    const result = calculateTypeMatchups(["Dragon", "Flying"], table);
    expect(result.weaknesses).toContainEqual({ type: "Ice", multiplier: 2.56 });
    expect(result.weaknesses).toContainEqual({ type: "Rock", multiplier: 1.6 });
    expect(result.resistances).toContainEqual({
      type: "Grass",
      multiplier: 0.390625,
    });
  });
});
