import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  readGymState,
  writeGymState,
  type GymRemovalReport,
} from "../../../../lib/gyms";
import { authOptions } from "../../auth/[...nextauth]";

interface ReviewBody {
  reportId?: unknown;
  decision?: unknown;
}

type RemovalReportsResponse =
  | { reports: GymRemovalReport[] }
  | {
      message: string;
      report: GymRemovalReport;
      gymRemoved: boolean;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RemovalReportsResponse>,
) {
  const session = await getServerSession(req, res, authOptions as NextAuthOptions);
  const user = session?.user as {
    id?: string | number;
    ign?: string;
    name?: string | null;
    role?: string;
  } | undefined;

  if (user?.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method === "GET") {
    const state = await readGymState();
    const reports = state.removalReports
      .filter((report) => report.status === "pending")
      .sort((left, right) => left.reportedAt.localeCompare(right.reportedAt));

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ reports });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as ReviewBody;
  const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
  const decision = body.decision === "approve" || body.decision === "reject"
    ? body.decision
    : null;

  if (!reportId) {
    return res.status(400).json({ error: "Removal report ID is required." });
  }

  if (!decision) {
    return res.status(400).json({ error: "Choose approve or reject." });
  }

  const state = await readGymState();
  const reportIndex = state.removalReports.findIndex(
    (report) => report.id === reportId && report.status === "pending",
  );

  if (reportIndex < 0) {
    return res.status(404).json({ error: "Pending removal report not found" });
  }

  const reviewedReport: GymRemovalReport = {
    ...state.removalReports[reportIndex],
    status: decision === "approve" ? "approved" : "rejected",
    reviewedAt: new Date().toISOString(),
    reviewedById: String(user.id ?? "unknown"),
    reviewedByIgn:
      typeof user.ign === "string" && user.ign.trim()
        ? user.ign.trim()
        : typeof user.name === "string" && user.name.trim()
          ? user.name.trim()
          : null,
  };
  const removalReports = [...state.removalReports];
  removalReports[reportIndex] = reviewedReport;
  const gymExisted = state.gyms.some((gym) => gym.id === reviewedReport.gymId);
  const gyms = decision === "approve"
    ? state.gyms.filter((gym) => gym.id !== reviewedReport.gymId)
    : state.gyms;

  await writeGymState({
    ...state,
    gyms,
    removalReports,
  });

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    message:
      decision === "approve"
        ? "Removal approved and the gym was removed from the map."
        : "Removal report rejected; the gym remains on the map.",
    report: reviewedReport,
    gymRemoved: decision === "approve" && gymExisted,
  });
}
