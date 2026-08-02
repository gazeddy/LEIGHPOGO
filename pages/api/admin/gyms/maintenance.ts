import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  clearAllNewGymFlags,
  rollbackLatestGymState,
} from "../../../../lib/gym-backups";
import { authOptions } from "../../auth/[...nextauth]";

type MaintenanceAction = "clear-new" | "rollback";

type MaintenanceResponse =
  | {
      message: string;
      total: number;
      importedAt: string | null;
      sourceFile: string | null;
      backupFile?: string | null;
      restoredFile?: string;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MaintenanceResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  const action = (req.body as { action?: unknown } | undefined)?.action;

  if (action !== "clear-new" && action !== "rollback") {
    return res.status(400).json({ error: "Choose a valid gym maintenance action." });
  }

  try {
    if (action === "clear-new") {
      const result = await clearAllNewGymFlags();

      return res.status(200).json({
        message:
          result.cleared === 0
            ? "No gyms currently have a new-gym timestamp."
            : `Cleared the new-gym status from ${result.cleared} gym${result.cleared === 1 ? "" : "s"}.`,
        total: result.state.gyms.length,
        importedAt: result.state.importedAt,
        sourceFile: result.state.sourceFile,
        backupFile: result.backupFile,
      });
    }

    const result = await rollbackLatestGymState();

    if (!result) {
      return res.status(409).json({ error: "No gym-state backup is available to restore." });
    }

    return res.status(200).json({
      message: `Restored gym data from ${result.restoredFile}. The replaced state was backed up as ${result.recoveryBackupFile}.`,
      total: result.state.gyms.length,
      importedAt: result.state.importedAt,
      sourceFile: result.state.sourceFile,
      restoredFile: result.restoredFile,
      backupFile: result.recoveryBackupFile,
    });
  } catch (error) {
    console.error("Gym maintenance action failed", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "The gym maintenance action could not be completed.",
    });
  }
}
