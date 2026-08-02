import type { GuideSummary } from "./guides";

export interface GuideSeriesSummary {
  slug: string;
  title: string;
  description: string;
  guideCount: number;
  order?: number;
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function getGuideSeriesTitle(seriesSlug: string): string {
  const title = titleFromSlug(seriesSlug);

  return /\bguides?$/i.test(title) ? title : `${title} Guides`;
}

function compareSeriesGuides(
  left: GuideSummary,
  right: GuideSummary,
): number {
  const seriesOrderDifference =
    (left.seriesOrder ?? Number.MAX_SAFE_INTEGER) -
    (right.seriesOrder ?? Number.MAX_SAFE_INTEGER);

  if (seriesOrderDifference !== 0) {
    return seriesOrderDifference;
  }

  const orderDifference =
    (left.order ?? Number.MAX_SAFE_INTEGER) -
    (right.order ?? Number.MAX_SAFE_INTEGER);

  return orderDifference !== 0
    ? orderDifference
    : left.title.localeCompare(right.title);
}

export function getGuidesBySeries(
  seriesSlug: string,
  guides: GuideSummary[],
): GuideSummary[] {
  const normalisedSlug = seriesSlug.trim().toLowerCase();

  if (
    normalisedSlug !== seriesSlug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalisedSlug)
  ) {
    return [];
  }

  return guides
    .filter((guide) => guide.series === normalisedSlug)
    .sort(compareSeriesGuides);
}

export function getGuideSeriesSummaries(
  guides: GuideSummary[],
): GuideSeriesSummary[] {
  const groupedGuides = new Map<string, GuideSummary[]>();

  guides.forEach((guide) => {
    if (!guide.series) {
      return;
    }

    const seriesGuides = groupedGuides.get(guide.series) ?? [];
    seriesGuides.push(guide);
    groupedGuides.set(guide.series, seriesGuides);
  });

  return Array.from(groupedGuides.entries())
    .map(([slug, seriesGuides]) => {
      const sortedGuides = [...seriesGuides].sort(compareSeriesGuides);
      const title = getGuideSeriesTitle(slug);
      const guideCount = sortedGuides.length;
      const orderedValues = sortedGuides
        .map((guide) => guide.order)
        .filter((order): order is number => typeof order === "number");
      const order =
        orderedValues.length > 0 ? Math.min(...orderedValues) : undefined;

      return {
        slug,
        title,
        description:
          guideCount === 1
            ? `Browse the guide in the ${title} series.`
            : `Browse all ${guideCount} guides in the ${title} series.`,
        guideCount,
        ...(order === undefined ? {} : { order }),
      };
    })
    .sort((left, right) => {
      const orderDifference =
        (left.order ?? Number.MAX_SAFE_INTEGER) -
        (right.order ?? Number.MAX_SAFE_INTEGER);

      return orderDifference !== 0
        ? orderDifference
        : left.title.localeCompare(right.title);
    });
}
