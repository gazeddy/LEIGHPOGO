import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
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

  try {
    if (req.method === "GET") {
      return res.status(200).json({ overrides: await readEventOverrides() });
    }

    if (req.method === "POST") {
      const override = await saveEventOverride(req.body as EventOverrideInput);

      return res.status(200).json({
        override,
        message: "Event feed override saved.",
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

      return res.status(200).json({ message: "Event override reset." });
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
