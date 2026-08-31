const {
  selectCurrentRaidBosses,
  selectNextRaidBosses,
  selectRaidBossEvents,
} = require("../../lib/event-selection");
const { raidStorageDate } = require("../../lib/raid-boss-history");
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

function nestedRaidEvent({ id, name, start, end, raidSchedule }) {
  return {
    eventID: id,
    name,
    eventType: "event",
    heading: "Event",
    link: "https://example.test/event",
    image: null,
    start,
    end,
    raidSchedule,
  };
}

describe("raid rotation visibility", () => {
  const groudon = raidEvent({
    id: "groudon",
    name: "Groudon in 5-star Raid Battles",
    start: "2026-08-12T06:00:00.000",
    end: "2026-08-19T05:59:59.000",
  });
  const lunala = raidEvent({
    id: "lunala",
    name: "Lunala in 5-star Raid Battles",
    start: "2026-08-19T06:00:00.000",
    end: "2026-08-26T06:00:00.000",
  });

  it("keeps the next five-star boss hidden until the final 24 hours", () => {
    expect(
      selectNextRaidBosses([groudon, lunala], new Date("2026-08-18T04:59:59.000Z")),
    ).toEqual([]);
  });

  it("shows only announcement metadata once the next boss is within 24 hours", () => {
    const next = selectNextRaidBosses(
      [groudon, lunala],
      new Date("2026-08-18T05:00:00.000Z"),
    );

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      eventID: "lunala",
      boss: "Lunala",
      category: "five-star",
      label: "5★",
      state: "next",
      start: "2026-08-19T06:00:00.000",
    });
    expect(next[0]).not.toHaveProperty("catchCp");
  });

  it("promotes the new boss to current at its start time", () => {
    const current = selectCurrentRaidBosses(
      [groudon, lunala],
      new Date("2026-08-19T05:00:00.000Z"),
    );
    expect(current.map((item) => item.boss)).toContain("Lunala");
  });
});

describe("raid storage timezone conversion", () => {
  it("stores summer London wall-clock times as BST instants", () => {
    expect(raidStorageDate("2026-08-31T10:00:00.000").toISOString()).toBe(
      "2026-08-31T09:00:00.000Z",
    );
  });

  it("stores winter London wall-clock times as GMT instants", () => {
    expect(raidStorageDate("2026-12-01T10:00:00.000").toISOString()).toBe(
      "2026-12-01T10:00:00.000Z",
    );
  });
});

describe("nested ScrapedDuck raid schedules", () => {
  const megaAscension = nestedRaidEvent({
    id: "mega-ascension",
    name: "Mega Ascension",
    start: "2026-08-31T10:00:00.000",
    end: "2026-09-04T23:59:00.000",
    raidSchedule: [
      {
        date: "Monday, August 31",
        time: null,
        label: null,
        bosses: [
          { name: "Mega Victreebel", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Dragonite", image: null, canBeShiny: true, raidType: "Mega" },
          { name: "Mega Malamar", image: null, canBeShiny: true, raidType: "Mega" },
        ],
      },
      {
        date: "Tuesday, September 1",
        time: null,
        label: null,
        bosses: [
          { name: "Mega Falinks", image: null, canBeShiny: true, raidType: "Mega" },
        ],
      },
    ],
  });

  it("turns a dated nested schedule into raid rotations and strips duplicate Mega prefixes", () => {
    const rotations = selectRaidBossEvents([megaAscension]);
    expect(rotations).toHaveLength(2);
    expect(rotations[0]).toMatchObject({
      category: "mega",
      boss: "Victreebel, Dragonite, Malamar",
      start: "2026-08-31T10:00:00.000",
      end: "2026-09-01T00:00:00.000",
    });
    expect(rotations[1]).toMatchObject({
      category: "mega",
      boss: "Falinks",
      start: "2026-09-01T00:00:00.000",
      end: "2026-09-02T00:00:00.000",
    });
  });

  it("shows today's simultaneous Mega Ascension bosses as current", () => {
    const current = selectCurrentRaidBosses(
      [megaAscension],
      new Date("2026-08-31T11:00:00.000Z"),
    );
    expect(current).toHaveLength(1);
    expect(current[0].boss).toBe("Victreebel, Dragonite, Malamar");
  });

  it("shows the following dated rotation inside the existing 24-hour next window", () => {
    const next = selectNextRaidBosses(
      [megaAscension],
      new Date("2026-08-31T11:00:00.000Z"),
    );
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      category: "mega",
      boss: "Falinks",
      state: "next",
      start: "2026-09-01T00:00:00.000",
    });
  });

  it("resolves weekday-only timed raid slots inside a parent event", () => {
    const finale = nestedRaidEvent({
      id: "pokemon-go-fest-2026-mega-finale",
      name: "Pokémon GO Fest 2026: Mega Finale",
      start: "2026-09-05T10:00:00.000",
      end: "2026-09-06T18:00:00.000",
      raidSchedule: [
        {
          date: "Saturday",
          time: "10:00 a.m. to 11:00 a.m.",
          label: "Verdant Overgrowth",
          bosses: [
            { name: "Mega Beedrill", image: null, canBeShiny: true, raidType: "Mega" },
            { name: "Mega Victreebel", image: null, canBeShiny: true, raidType: "Mega" },
            { name: "Mega Pinsir", image: null, canBeShiny: true, raidType: "Mega" },
            { name: "Mega Abomasnow", image: null, canBeShiny: true, raidType: "Mega" },
          ],
        },
      ],
    });

    const rotations = selectRaidBossEvents([finale]);
    expect(rotations).toHaveLength(1);
    expect(rotations[0]).toMatchObject({
      boss: "Beedrill, Victreebel, Pinsir, Abomasnow",
      start: "2026-09-05T10:00:00.000",
      end: "2026-09-05T11:00:00.000",
    });

    const current = selectCurrentRaidBosses(
      [finale],
      new Date("2026-09-05T09:30:00.000Z"),
    );
    expect(current).toHaveLength(1);
    expect(current[0].boss).toContain("Victreebel");
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
