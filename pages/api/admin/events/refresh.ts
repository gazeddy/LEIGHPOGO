import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { forceRefreshEventsCache } from "../../../../lib/events-server";
import { authOptions } from "../../auth/[...nextauth]";

type RefreshResponse =
  | {
      message: string;
      fetchedAt: string;
      count: number;
    }
  | {
      error: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions,
  );
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const data = await forceRefreshEventsCache();

    return res.status(200).json({
      message: `Event data refreshed successfully (${data.events.length} upcoming events).`,
      fetchedAt: data.fetchedAt,
      count: data.events.length,
    });
  } catch (error) {
    console.error("Failed to refresh event data", error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The event data refresh failed.",
    });
  }
}
