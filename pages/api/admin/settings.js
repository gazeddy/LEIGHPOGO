import { getServerSession } from "next-auth/next"
import { getCampfireUrl, setCampfireUrl } from "../../../lib/siteSettings"
import { authOptions } from "../auth/[...nextauth].js"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)

  if (!session || session.user.role !== "admin") {
    return res.status(403).json({ error: "Access denied" })
  }

  if (req.method === "GET") {
    return res.status(200).json({ campfireUrl: await getCampfireUrl() })
  }

  if (req.method === "PUT") {
    try {
      const campfireUrl = await setCampfireUrl(req.body?.campfireUrl)
      return res.status(200).json({ campfireUrl })
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Invalid Campfire URL",
      })
    }
  }

  res.setHeader("Allow", ["GET", "PUT"])
  return res.status(405).json({ error: "Method not allowed" })
}
