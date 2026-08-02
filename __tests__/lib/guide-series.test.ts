import {
  getGuideSeriesSummaries,
  getGuideSeriesTitle,
  getGuidesBySeries,
} from "../../lib/guide-series";
import type { GuideSummary } from "../../lib/guides";

const guides: GuideSummary[] = [
  {
    slug: "max-battles-advanced",
    title: "Advanced Max Battles",
    description: "Advanced advice",
    order: 2,
    series: "max-battles",
    seriesOrder: 2,
  },
  {
    slug: "max-battles-start",
    title: "Starting Max Battles",
    description: "Beginner advice",
    order: 1,
    series: "max-battles",
    seriesOrder: 1,
  },
  {
    slug: "wayfarer-start",
    title: "Starting with Wayfarer",
    description: "Wayfarer advice",
    order: 3,
    series: "wayfarer-guides",
    seriesOrder: 1,
  },
  {
    slug: "standalone-guide",
    title: "Standalone Guide",
    description: "Not part of a series",
    order: 4,
  },
];

describe("guide series helpers", () => {
  it("creates one summary card per series", () => {
    expect(getGuideSeriesSummaries(guides)).toEqual([
      {
        slug: "max-battles",
        title: "Max Battles Guides",
        description: "Browse all 2 guides in the Max Battles Guides series.",
        guideCount: 2,
        order: 1,
      },
      {
        slug: "wayfarer-guides",
        title: "Wayfarer Guides",
        description: "Browse the guide in the Wayfarer Guides series.",
        guideCount: 1,
        order: 3,
      },
    ]);
  });

  it("orders guides by their numeric series position", () => {
    expect(
      getGuidesBySeries("max-battles", guides).map((guide) => guide.slug),
    ).toEqual(["max-battles-start", "max-battles-advanced"]);
  });

  it("rejects invalid series slugs", () => {
    expect(getGuidesBySeries("../max-battles", guides)).toEqual([]);
    expect(getGuidesBySeries("Max-Battles", guides)).toEqual([]);
  });

  it("does not duplicate the word Guides", () => {
    expect(getGuideSeriesTitle("wayfarer-guides")).toBe("Wayfarer Guides");
  });
});
