import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  getGymDisplayName,
  gymIsNew,
  readGymState,
  type GymRecord,
} from "../../../lib/gyms";
import { authOptions } from "../auth/[...nextauth]";

interface NewGymItem extends GymRecord {
  displayName: string;
}

type NewGymResponse = { gyms: NewGymItem[] } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<NewGymResponse>,
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
  const gyms = state.gyms
    .filter((gym) => gymIsNew(gym))
    .sort((left, right) =>
      (right.firstSeenAt || "").localeCompare(left.firstSeenAt || ""),
    )
    .map((gym) => ({
      ...gym,
      displayName: getGymDisplayName(gym),
    }));

  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({ gyms });
}
