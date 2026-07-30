import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  deleteEventTypeRule,
  readEventTypeRules,
  saveEventTypeRule,
  type EventTypeRule,
  type EventTypeRuleInput,
} from "../../../lib/event-overrides";
import { authOptions } from "../auth/[...nextauth]";

type EventTypeRuleResponse =
  | { rules: EventTypeRule[] }
  | { rule: EventTypeRule; message: string }
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
  res: NextApiResponse<EventTypeRuleResponse>,
) {
  if (!(await isAdmin(req, res))) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({ rules: await readEventTypeRules() });
    }

    if (req.method === "POST") {
      const rule = await saveEventTypeRule(req.body as EventTypeRuleInput);

      return res.status(200).json({
        rule,
        message: "Event type visibility rule saved.",
      });
    }

    if (req.method === "DELETE") {
      const eventType =
        typeof req.query.eventType === "string" ? req.query.eventType : "";

      if (!eventType) {
        return res.status(400).json({ error: "Event type is required" });
      }

      const deleted = await deleteEventTypeRule(eventType);

      if (!deleted) {
        return res.status(404).json({ error: "Event type rule not found" });
      }

      return res.status(200).json({ message: "Event type rule reset." });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Event type rule administration failed", error);

    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "The event type rule could not be saved.",
    });
  }
}
