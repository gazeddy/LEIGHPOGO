import type { NextApiRequest, NextApiResponse } from "next";
import type { EventTickerItem, PokemonGoEventSummary } from "../../../lib/events";
import { getEventsPageData } from "../../../lib/events-server";
import { getAllGuides, type GuideSummary } from "../../../lib/guides";

type TickerResponse =
  | {
      items: EventTickerItem[];
      fetchedAt: string;
    }
  | {
      error: string;
    };

function guideScore(event: PokemonGoEventSummary, guide: GuideSummary): number {
  const eventType = event.eventType.toLowerCase();
  const eventTags = new Set((event.tags ?? []).map((tag) => tag.toLowerCase()));
  let score = guide.eventTypes?.includes(eventType) ? 100 : 0;

  guide.tags?.forEach((tag) => {
    if (eventTags.has(tag.toLowerCase())) {
      score += 10;
    }
  });

  return score;
}

function findBestGuide(
  event: PokemonGoEventSummary,
  guides: GuideSummary[],
): GuideSummary | null {
  let bestGuide: GuideSummary | null = null;
  let bestScore = 0;

  guides.forEach((guide) => {
    const score = guideScore(event, guide);

    if (score > bestScore) {
      bestGuide = guide;
      bestScore = score;
    }
  });

  return bestGuide;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TickerResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [eventData, guides] = await Promise.all([
      getEventsPageData(),
      Promise.resolve(getAllGuides()),
    ]);

    const items: EventTickerItem[] = eventData.events.slice(0, 12).map((event) => {
      const guide = findBestGuide(event, guides);

      return {
        eventID: event.eventID,
        name: event.name,
        heading: event.heading,
        start: event.start,
        end: event.end,
        guideSlug: guide?.slug ?? null,
        guideTitle: guide?.title ?? null,
      };
    });

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).json({
      items,
      fetchedAt: eventData.fetchedAt,
    });
  } catch (error) {
    console.error("Failed to load event ticker", error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The event ticker could not be loaded.",
    });
  }
}
