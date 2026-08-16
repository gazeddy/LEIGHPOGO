import crypto from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  sendWednesdayRaidHourPush,
  type RaidHourPushResult,
} from "../../../lib/raid-hour-push";

type RaidHourResponse = RaidHourPushResult | { error: string };

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
  res: NextApiResponse<RaidHourResponse>,
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

  try {
    const result = await sendWednesdayRaidHourPush(new Date());
    return res.status(200).json(result);
  } catch (error) {
    console.error("Wednesday Raid Hour push job failed", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Wednesday Raid Hour push job failed.",
    });
  }
}
