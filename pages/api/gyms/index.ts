import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { readGymState, sortGyms, type GymRecord } from "../../../lib/gyms";
import { authOptions } from "../auth/[...nextauth]";

type GymResponse =
  | {
      gyms: GymRecord[];
      importedAt: string | null;
      sourceFile: string | null;
    }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GymResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions as NextAuthOptions);

  if (!session) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const state = await readGymState();

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    gyms: sortGyms(state.gyms),
    importedAt: state.importedAt,
    sourceFile: state.sourceFile,
  });
}
