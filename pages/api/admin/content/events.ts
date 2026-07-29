import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  createLocalEvent,
  deleteLocalEvent,
  readLocalEvents,
  type LocalEvent,
  type LocalEventInput,
} from "../../../../lib/local-events";
import { authOptions } from "../../auth/[...nextauth]";

type EventResponse =
  | { events: LocalEvent[] }
  | { event: LocalEvent; message: string }
  | { message: string }
  | { error: string };

async function isAdmin(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const session = await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions,
  );

  return (session?.user as { role?: string } | undefined)?.role === "admin";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EventResponse>,
) {
  if (!(await isAdmin(req, res))) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ events: await readLocalEvents() });
    }

    if (req.method === "POST") {
      const event = await createLocalEvent(req.body as LocalEventInput);

      return res.status(201).json({
        event,
        message: "Local event created successfully.",
      });
    }

    if (req.method === "DELETE") {
      const id = typeof req.query.id === "string" ? req.query.id : "";

      if (!id) {
        return res.status(400).json({ error: "Event ID is required" });
      }

      const deleted = await deleteLocalEvent(id);

      if (!deleted) {
        return res.status(404).json({ error: "Local event not found" });
      }

      return res.status(200).json({ message: "Local event deleted." });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Local event administration failed", error);

    return res.status(400).json({
      error: error instanceof Error ? error.message : "The event could not be saved.",
    });
  }
}
