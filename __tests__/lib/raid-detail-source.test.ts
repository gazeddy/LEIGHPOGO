import { matchMegaSupplementRecords } from "../../lib/raid-detail-source";
import type { RaidBossTickerItem } from "../../lib/events";

const megaRecords = [
  {
    pokemon_id: 445,
    pokemon_name: "Garchomp",
    mega_name: "Mega Garchomp",
    form: "Normal",
    type: ["Dragon", "Ground"],
  },
  {
    pokemon_id: 6,
    pokemon_name: "Charizard",
    mega_name: "Mega Charizard X",
    form: "X",
    type: ["Fire", "Dragon"],
  },
  {
    pokemon_id: 6,
    pokemon_name: "Charizard",
    mega_name: "Mega Charizard Y",
    form: "Y",
    type: ["Fire", "Flying"],
  },
];

function tickerItem(boss: string, category: RaidBossTickerItem["category"] = "mega"): RaidBossTickerItem {
  return {
    eventID: `${category}-${boss}`,
    category,
    label: category === "mega" ? "Mega" : "5★",
    boss,
    start: "2026-08-16T10:00:00.000",
    end: "2026-08-17T10:00:00.000",
    link: null,
  };
}

describe("Mega raid detail fallback", () => {
  it("matches Mega Garchomp directly from the Mega supplement data", () => {
    expect(matchMegaSupplementRecords(tickerItem("Mega Garchomp"), megaRecords)).toEqual([
      megaRecords[0],
    ]);
  });

  it("keeps distinct Mega forms separate", () => {
    expect(matchMegaSupplementRecords(tickerItem("Mega Charizard X"), megaRecords)).toEqual([
      megaRecords[1],
    ]);
    expect(matchMegaSupplementRecords(tickerItem("Mega Charizard Y"), megaRecords)).toEqual([
      megaRecords[2],
    ]);
  });

  it("does not use Mega supplement data for non-Mega raid categories", () => {
    expect(
      matchMegaSupplementRecords(tickerItem("Garchomp", "five-star"), megaRecords),
    ).toEqual([]);
  });
});
