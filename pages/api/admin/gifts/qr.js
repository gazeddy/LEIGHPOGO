import { getServerSession } from "next-auth/next"
import { authOptions } from "../../auth/[...nextauth]"
import { currentGiftQr } from "../../../../lib/giftQr"

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (session?.user?.role !== "admin") return res.status(403).json({ error: "Admin only" })
  const { token, expiresAt } = currentGiftQr()
  res.setHeader("Cache-Control", "private, no-store")
  return res.status(200).json({ urlPath: "/gifts?qr=" + encodeURIComponent(token), expiresAt })
}
