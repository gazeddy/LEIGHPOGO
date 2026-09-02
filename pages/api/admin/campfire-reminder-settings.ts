import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  readCampfireReminderSettings,
  saveCampfireReminderSettings,
} from "../../../lib/campfire-reminder-settings";
import type {
  CampfireReminderSettings,
  CampfireReminderSettingsInput,
} from "../../../lib/campfire-reminder-rules";
import { authOptions } from "../auth/[...nextauth]";

type ResponseBody =
  | { settings: CampfireReminderSettings; message?: string }
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
  res: NextApiResponse<ResponseBody>,
) {
  if (!(await isAdmin(req, res))) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json({
        settings: await readCampfireReminderSettings(),
      });
    }

    if (req.method === "POST") {
      const settings = await saveCampfireReminderSettings(
        req.body as CampfireReminderSettingsInput,
      );

      return res.status(200).json({
        settings,
        message: "Campfire meetup reminder settings saved.",
      });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Campfire reminder settings administration failed", error);
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Campfire reminder settings could not be saved.",
    });
  }
}
