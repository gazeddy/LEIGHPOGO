import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  getGymDisplayName,
  readGymState,
  writeGymState,
  type GymRemovalReport,
} from "../../../lib/gyms";
import { authOptions } from "../auth/[...nextauth]";

interface ReportBody {
  gymId?: unknown;
}

type ReportResponse =
  | { message: string; report: GymRemovalReport }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReportResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions as NextAuthOptions);

  if (!session) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const gymId =
    typeof (req.body as ReportBody).gymId === "string"
      ? String((req.body as ReportBody).gymId).trim()
      : "";

  if (!gymId) {
    return res.status(400).json({ error: "Gym ID is required." });
  }

  const state = await readGymState();
  const gym = state.gyms.find((item) => item.id === gymId);

  if (!gym) {
    return res.status(404).json({ error: "Gym not found" });
  }

  const existing = state.removalReports.find(
    (report) => report.gymId === gymId && report.status === "pending",
  );

  if (existing) {
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      message: "This gym is already awaiting administrator review.",
      report: existing,
    });
  }

  const user = session.user as {
    id?: string | number;
    ign?: string;
    name?: string | null;
  } | undefined;
  const report: GymRemovalReport = {
    id: randomUUID(),
    gymId: gym.id,
    gymName: getGymDisplayName(gym),
    reportedById: String(user?.id ?? "unknown"),
    reportedByIgn:
      typeof user?.ign === "string" && user.ign.trim()
        ? user.ign.trim()
        : typeof user?.name === "string" && user.name.trim()
          ? user.name.trim()
          : null,
    reportedAt: new Date().toISOString(),
    status: "pending",
    reviewedAt: null,
    reviewedById: null,
    reviewedByIgn: null,
  };

  await writeGymState({
    ...state,
    removalReports: [...state.removalReports, report],
  });

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(201).json({
    message: "Gym removal reported. An administrator will review it.",
    report,
  });
}
