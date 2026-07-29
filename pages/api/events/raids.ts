import type { NextApiRequest, NextApiResponse } from "next";
import type { RaidBossTickerItem } from "../../../lib/events";
import { selectCurrentRaidBosses } from "../../../lib/event-selection";
import { getEventsPageData } from "../../../lib/events-server";

type RaidTickerResponse =
  | {
      items: RaidBossTickerItem[];
      fetchedAt: string;
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RaidTickerResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const eventData = await getEventsPageData(160);
    const items = selectCurrentRaidBosses(eventData.events);

    res.setHeader("Cache-Control", "private, no-store");

    return res.status(200).json({
      items,
      fetchedAt: eventData.fetchedAt,
    });
  } catch (error) {
    console.error("Failed to load current raid bosses", error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The current raid bosses could not be loaded.",
    });
  }
}
