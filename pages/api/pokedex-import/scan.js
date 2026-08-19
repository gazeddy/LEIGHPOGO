import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store")

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) {
    return res.status(401).json({ error: "You must be signed in to import your Pokédex." })
  }

  return res.status(409).json({
    error: "Direct OCR processing is disabled. Submit screenshots through the Pokédex import queue instead.",
    queueEndpoint: "/api/pokedex-import/jobs",
  })
}
