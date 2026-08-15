import type { NextApiRequest, NextApiResponse } from "next";
import type { RaidBossTickerItem } from "../../../lib/events";
import { getRaidToolsData } from "../../../lib/raid-boss-history";

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
    const data = await getRaidToolsData();
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      items: data.tickerItems,
      fetchedAt: data.fetchedAt,
    });
  } catch (error) {
    console.error("Failed to load raid boss ticker data", error);
    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The current raid bosses could not be loaded.",
    });
  }
}
