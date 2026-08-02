const os = require("os");
const path = require("path");
const {
  findRaidBossCpMatches,
  getRaidBossCpData,
} = require("../../lib/raidBossCpCache");

const URL = "https://pogoapi.net/api/v1/raid_bosses.json";

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
      prefix: plainText.slice(0, 120),
    });

    expect(plainResponse.ok).toBe(true);

    const payload = JSON.parse(plainText);
    const current = payload.current;
    const fiveStar = Array.isArray(current?.["5"]) ? current["5"] : [];
    const tierSix = Array.isArray(current?.["6"]) ? current["6"] : [];
    const mega = Array.isArray(current?.mega) ? current.mega : [];

    console.log("POGOAPI live raid groups", {
      keys: current && typeof current === "object" ? Object.keys(current) : [],
      fiveStar: fiveStar.map(({ name, form, max_unboosted_cp, max_boosted_cp }) => ({
        name,
        form,
        max_unboosted_cp,
        max_boosted_cp,
      })),
      tierSix: tierSix.map(({ name, form, max_unboosted_cp, max_boosted_cp }) => ({
        name,
        form,
        max_unboosted_cp,
        max_boosted_cp,
      })),
      mega: mega.map(({ name, form, max_unboosted_cp, max_boosted_cp }) => ({
        name,
        form,
        max_unboosted_cp,
        max_boosted_cp,
      })),
    });

    const data = await getRaidBossCpData({
      allowStale: false,
      cachePath: path.join(os.tmpdir(), `leighpogo-raid-cp-${process.pid}.json`),
      forceRefresh: true,
      strictWrite: true,
    });

    console.log("LEIGHPOGO parsed live bosses", data.bosses);
    console.log("LEIGHPOGO current matches", {
      kyurem: findRaidBossCpMatches(tickerItem("five-star", "Kyurem"), data.bosses),
      megaAggron: findRaidBossCpMatches(tickerItem("mega", "Aggron"), data.bosses),
      shadowPalkia: findRaidBossCpMatches(tickerItem("shadow", "Palkia"), data.bosses),
    });

    expect(data.bosses.length).toBeGreaterThan(0);
  });
});
