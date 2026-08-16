import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import {
  cleanAlias,
  cleanMarkerEmoji,
  readGymState,
  writeGymState,
  type GymRecord,
} from "../../../../lib/gyms";
import { authOptions } from "../../auth/[...nextauth]";

interface AliasBody {
  id?: unknown;
  alias?: unknown;
  markerEmoji?: unknown;
}

type AliasResponse =
  | { message: string; gym: GymRecord }
  | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AliasResponse>,
) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions as NextAuthOptions);

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const body = req.body as AliasBody;
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) {
      throw new Error("Gym ID is required.");
    }

    const alias = cleanAlias(body.alias);
    const markerEmoji = cleanMarkerEmoji(body.markerEmoji);
    const state = await readGymState();
    const index = state.gyms.findIndex((gym) => gym.id === id);

    if (index < 0) {
      return res.status(404).json({ error: "Gym not found" });
    }

    const gym = { ...state.gyms[index], alias, markerEmoji };
    const gyms = [...state.gyms];
    gyms[index] = gym;

    await writeGymState({ ...state, gyms });

    return res.status(200).json({
      message: "Gym display settings saved.",
      gym,
    });
  } catch (error) {
    console.error("Gym display settings update failed", error);
    return res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "The gym display settings could not be saved.",
    });
  }
}
