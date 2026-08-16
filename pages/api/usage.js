import { getServerSession } from "next-auth/next"
import { authOptions } from "./auth/[...nextauth]"
import { recordUsageEvent } from "../../lib/usageEvents"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const userId = Number(session?.user?.id)

  if (!Number.isInteger(userId)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const type = String(req.body?.type || "").trim().toUpperCase()

  if (type !== "POKEMON_GO_LAUNCHED") {
    return res.status(400).json({ error: "Unsupported client usage event." })
  }

  const path = String(req.body?.path || "").trim()

  await recordUsageEvent({
    type,
    ownerId: userId,
    path: path.startsWith("/") ? path : null,
    userAgent: req.headers["user-agent"],
  })

  return res.status(204).end()
}
