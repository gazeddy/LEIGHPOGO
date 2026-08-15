import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"
import { sendPushToUser } from "../../../lib/pushServer"
import { isWebPushConfigured } from "../../../lib/webPush"

const sessionUserId = (session) => {
  const userId = Number(session?.user?.id)
  return Number.isInteger(userId) ? userId : null
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  const userId = sessionUserId(session)

  if (!userId) {
    return res.status(401).json({ error: "You must be logged in." })
  }

  res.setHeader("Cache-Control", "private, no-store")

  if (!isWebPushConfigured()) {
    return res.status(503).json({
      error: "Web Push delivery is not configured on this server.",
    })
  }

  const result = await sendPushToUser(userId, {
    title: "LEIGHPOGO test notification",
    body: "Push notifications are working.",
    url: "/notifications",
    tag: "leighpogo-push-test",
  })

  if (result.subscriptions === 0) {
    return res.status(409).json({
      error: "No push subscriptions are registered for your account.",
      ...result,
    })
  }

  if (result.sent === 0) {
    return res.status(502).json({
      error: "The push service did not accept the test notification.",
      ...result,
    })
  }

  return res.status(200).json(result)
}
