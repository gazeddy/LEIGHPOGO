import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { sendDailyRaidSummary } from "../../../lib/raid-daily-summary";
import {
  sendRaidEventPushes,
  type RaidEventPushResult,
} from "../../../lib/raid-event-push";

type RaidEventResponse = RaidEventPushResult | { error: string };

function isAuthorised(req: NextApiRequest): boolean {
  const expected = String(process.env.RAID_HOUR_CRON_SECRET || "").trim();
  const suppliedHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const supplied = String(suppliedHeader || "").replace(/^Bearer\s+/i, "").trim();

  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RaidEventResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!String(process.env.RAID_HOUR_CRON_SECRET || "").trim()) {
    return res.status(503).json({
      error: "RAID_HOUR_CRON_SECRET is not configured.",
    });
  }

  if (!isAuthorised(req)) {
    return res.status(401).json({ error: "Unauthorised scheduler request." });
  }

  const now = new Date();
  // Start the daily job independently so it can still complete even if the
  // separate 30-minute raid-event reminder fails on the same scheduler tick.
  const dailySummary = sendDailyRaidSummary(now).catch((error) => {
    console.error(
      "Daily raid summary job failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  });

  try {
    const result = await sendRaidEventPushes(now);
    await dailySummary;
    return res.status(200).json(result);
  } catch (error) {
    await dailySummary;
    console.error("Raid event push job failed", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Raid event push job failed.",
    });
  }
}
