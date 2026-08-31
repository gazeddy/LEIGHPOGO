import { randomUUID } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  cleanCommunityGymTitle,
  COMMUNITY_GYM_ID_PREFIX,
} from "../../../lib/communityGyms";
import {
  readGymState,
  sortGyms,
  writeGymState,
  type GymRecord,
} from "../../../lib/gyms";
import { authOptions } from "../auth/[...nextauth]";

interface CreateGymBody {
  title?: unknown;
  lat?: unknown;
  lon?: unknown;
}

type CreateGymResponse =
  | { message: string; gym: GymRecord }
  | { error: string };

function coordinate(
  value: unknown,
  field: "latitude" | "longitude",
): number {
  const number = Number(value);
  const minimum = field === "latitude" ? -90 : -180;
  const maximum = field === "latitude" ? 90 : 180;

  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`The ${field} is invalid.`);
  }

  return number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateGymResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions as NextAuthOptions);

  if (!session) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const body = req.body as CreateGymBody;
    const title = cleanCommunityGymTitle(body.title);
    const lat = coordinate(body.lat, "latitude");
    const lon = coordinate(body.lon, "longitude");
    const createdAt = new Date().toISOString();
    const gym: GymRecord = {
      id: `${COMMUNITY_GYM_ID_PREFIX}${randomUUID()}`,
      name: title,
      alias: null,
      markerEmoji: null,
      url: null,
      lat,
      lon,
      exRaidEligible: false,
      firstSeenAt: createdAt,
    };
    const state = await readGymState();

    await writeGymState({
      ...state,
      gyms: sortGyms([...state.gyms, gym]),
    });

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(201).json({
      message: "Gym added successfully.",
      gym,
    });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "The gym could not be added.",
    });
  }
}
