import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import { isWebPushConfigured } from "../../../lib/webPush"

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) ? userId : null
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!sessionUserId(session)) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim()
  const configured = isWebPushConfigured()

  return res.status(200).json({
    configured,
    publicKey: configured ? publicKey : null,
  })
}
