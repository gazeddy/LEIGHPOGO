import type { NextApiRequest, NextApiResponse } from "next";
import type { EventTickerItem } from "../../../lib/events";
import { getEventsPageData } from "../../../lib/events-server";
import { getAllGuides } from "../../../lib/guides";

type TickerResponse =
  | {
      items: EventTickerItem[];
      fetchedAt: string;
    }
  | {
      error: string;
    };

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
    const guideByEventType = new Map<
      string,
      { slug: string; title: string }
    >();

    guides.forEach((guide) => {
      guide.eventTypes?.forEach((eventType) => {
        if (!guideByEventType.has(eventType)) {
          guideByEventType.set(eventType, {
            slug: guide.slug,
            title: guide.title,
          });
        }
      });
    });

    const items: EventTickerItem[] = eventData.events.slice(0, 12).map((event) => {
      const guide = guideByEventType.get(event.eventType.toLowerCase());

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
