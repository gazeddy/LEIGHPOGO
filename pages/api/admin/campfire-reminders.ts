import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { eventsMissingCampfireMeetups } from "../../../lib/campfire-reminder-rules";
import { readCampfireReminderSettings } from "../../../lib/campfire-reminder-settings";
import { readEventOverrides } from "../../../lib/event-overrides";
import { getImportedEventsForAdmin } from "../../../lib/events-server";
import { authOptions } from "../auth/[...nextauth]";

type ReminderEvent = {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  start: string;
  end: string;
};

type ResponseBody =
  | { count: number; events: ReminderEvent[] }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseBody>,
) {
  const session = await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const [feed, overrides, settings] = await Promise.all([
      getImportedEventsForAdmin(240),
      readEventOverrides(),
      readCampfireReminderSettings(),
    ]);
    const events = eventsMissingCampfireMeetups(
      feed.events,
      overrides,
      settings,
    ).map((event) => ({
      eventID: event.eventID,
      name: event.name,
      eventType: event.eventType,
      heading: event.heading,
      start: event.start,
      end: event.end,
    }));

    return res.status(200).json({ count: events.length, events });
  } catch (error) {
    console.error("Campfire reminder lookup failed", error);
    return res.status(500).json({ error: "Campfire reminders could not be loaded." });
  }
}
