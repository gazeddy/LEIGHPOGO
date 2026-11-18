import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  canonicaliseEventOverrideCampfireLinks,
  findCampfireDuplicateAssignments,
  formatCampfireDuplicateWarning,
} from "../../../lib/campfire-links";
import { startEventInfographicAutomation } from "../../../lib/event-infographic-automation";
import {
  deleteEventOverride,
  readEventOverrides,
  saveEventOverride,
  type EventOverride,
  type EventOverrideInput,
} from "../../../lib/event-overrides";
import { authOptions } from "../auth/[...nextauth]";

type EventOverrideResponse =
  | { overrides: EventOverride[] }
  | { override: EventOverride; message: string }
  | { message: string }
  | { error: string };

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EventOverrideResponse>,
) {
  if (!(await isAdmin(req, res))) {
    return res.status(403).json({ error: "Access denied" });
  }

  startEventInfographicAutomation();

  try {
    if (req.method === "GET") {
      return res.status(200).json({ overrides: await readEventOverrides() });
    }

    if (req.method === "POST") {
      const verifiedInput = await canonicaliseEventOverrideCampfireLinks(
        req.body as EventOverrideInput,
      );
      const override = await saveEventOverride(verifiedInput);
      const overrides = await readEventOverrides();
      const duplicateWarning = formatCampfireDuplicateWarning(
        await findCampfireDuplicateAssignments(override.eventID, overrides),
      );

      return res.status(200).json({
        override,
        message: duplicateWarning
          ? `Event feed override saved. ${duplicateWarning}`
          : "Event feed override saved. Campfire meetup links were verified; cmpf.re share links were preserved for Campfire app hand-off. Public event infographics will regenerate in the background.",
      });
    }

    if (req.method === "DELETE") {
      const eventID =
        typeof req.query.eventID === "string" ? req.query.eventID : "";

      if (!eventID) {
        return res.status(400).json({ error: "Event ID is required" });
      }

      const deleted = await deleteEventOverride(eventID);

      if (!deleted) {
        return res.status(404).json({ error: "Event override not found" });
      }

      return res.status(200).json({
        message: "Event override reset. Public event infographics will regenerate in the background.",
      });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Event override administration failed", error);

    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "The event override could not be saved.",
    });
  }
}
