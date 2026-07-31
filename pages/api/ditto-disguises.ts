import type { NextApiRequest, NextApiResponse } from "next";
import type { DittoDisguisePayload } from "../../lib/ditto-disguises";
import { getDittoDisguiseData } from "../../lib/ditto-disguises-server";

type DittoDisguiseResponse = DittoDisguisePayload | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DittoDisguiseResponse>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = await getDittoDisguiseData();

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    );

    return res.status(200).json(payload);
  } catch (error) {
    console.error("Failed to load current Ditto disguises", error);

    return res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : "The current Ditto disguises could not be loaded.",
    });
  }
}
