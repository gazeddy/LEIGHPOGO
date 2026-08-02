const os = require("os");
const path = require("path");
const {
  findRaidBossCpMatches,
  getRaidBossCpData,
} = require("../../lib/raidBossCpCache");

const URL = "https://pogoapi.net/api/v1/raid_bosses.json";
const TARGETS = new Set(["kyurem", "aggron", "palkia"]);

jest.setTimeout(45_000);

function tickerItem(category, boss) {
  return {
    eventID: `${category}-${boss}`,
    category,
    label: category === "five-star" ? "5★" : category === "shadow" ? "Shadow" : "Mega",
    boss,
    end: "2026-08-04T22:00:00.000",
    link: null,
  };
}

function findTargets(section) {
  if (!section || typeof section !== "object") return [];

  return Object.entries(section).flatMap(([group, values]) =>
    Array.isArray(values)
      ? values
          .filter((entry) => TARGETS.has(String(entry?.name || "").toLowerCase()))
          .map(({ name, form, max_unboosted_cp, max_boosted_cp }) => ({
            group,
            name,
            form,
            max_unboosted_cp,
            max_boosted_cp,
          }))
      : [],
  );
}

describe("live PoGoAPI raid boss diagnostics", () => {
  it("downloads and parses the live raid CP feed", async () => {
    const plainResponse = await fetch(URL, {
      headers: { Accept: "application/json" },
    });
    const plainText = await plainResponse.text();

    console.log("POGOAPI plain response", {
      status: plainResponse.status,
      contentType: plainResponse.headers.get("content-type"),
      bytes: plainText.length,
    });

    expect(plainResponse.ok).toBe(true);

    const payload = JSON.parse(plainText);
    const current = payload.current;
    const previous = payload.previous;

    console.log("POGOAPI target records", {
      current: findTargets(current),
      previous: findTargets(previous),
      currentKeys: current && typeof current === "object" ? Object.keys(current) : [],
      previousKeys: previous && typeof previous === "object" ? Object.keys(previous) : [],
    });

    const data = await getRaidBossCpData({
      allowStale: false,
      cachePath: path.join(os.tmpdir(), `leighpogo-raid-cp-${process.pid}.json`),
      forceRefresh: true,
      strictWrite: true,
    });

    console.log("LEIGHPOGO current matches", {
      kyurem: findRaidBossCpMatches(tickerItem("five-star", "Kyurem"), data.bosses),
      megaAggron: findRaidBossCpMatches(tickerItem("mega", "Aggron"), data.bosses),
      shadowPalkia: findRaidBossCpMatches(tickerItem("shadow", "Palkia"), data.bosses),
    });

    expect(data.bosses.length).toBeGreaterThan(0);
  });
});
