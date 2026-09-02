import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { infographicFilename } from "../../../lib/event-infographic";
import { renderEventInfographicSocialPng } from "../../../lib/event-infographic-social";
import { getInfographicEventsData } from "../../../lib/infographic-events-server";
import { authOptions } from "../auth/[...nextauth]";

async function isAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<boolean> {
  const session = await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions,
  );

  return (session?.user as { role?: string } | undefined)?.role === "admin";
}

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!(await isAdmin(req, res))) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const eventID = typeof req.query.eventID === "string" ? req.query.eventID : "";
  if (!eventID) {
    return res.status(400).json({ error: "Event ID is required" });
  }

  try {
    const data = await getInfographicEventsData(240);
    const event = data.events.find((candidate) => candidate.eventID === eventID);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const png = await renderEventInfographicSocialPng(event);
    const disposition = req.query.download === "1" ? "attachment" : "inline";

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", String(png.length));
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${infographicFilename(event)}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(png);
  } catch (error) {
    console.error("Event infographic generation failed", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "The event infographic could not be generated.",
    });
  }
}
