import { randomUUID } from "node:crypto"
import { parse } from "csv-parse/sync"
import { getServerSession } from "next-auth/next"
import prisma from "../../../../lib/prisma"
import { authOptions } from "../../auth/[...nextauth]"

export function parseGiftCodes(value, format = "text") {
  if (typeof value !== "string") throw new Error("Provide redemption codes")
  if (format !== "csv") return value.split(/[\\r\\n,]+/).map(x => x.trim()).filter(Boolean)
  let rows
  try {
    rows = parse(value.replace(/^\\uFEFF/, ""), { skip_empty_lines: true, relax_quotes: false, trim: true })
  } catch {
    throw new Error("Invalid CSV file")
  }
  if (!rows.length) return []
  const headers = rows[0].map(x => x.toLowerCase().trim())
  const codeIndex = headers.findIndex(x => ["code", "redemption code", "redemption_code", "offer code", "gift code", "passcode"].includes(x))
  const start = codeIndex >= 0 ? 1 : 0
  const index = codeIndex >= 0 ? codeIndex : 0
  if (codeIndex < 0 && rows.some(row => row.length !== 1)) throw new Error("CSV must contain one code column or a named code header")
  if (rows.some(row => row.length <= index)) throw new Error("CSV rows have missing code columns")
  return rows.slice(start).map(row => row[index].trim()).filter(Boolean)
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (session?.user?.role !== "admin") return res.status(403).json({ error: "Admin only" })
  if (req.method === "GET") {
    const batches = await prisma.giftBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { codes: { select: { ownerId: true, claimedAt: true, owner: { select: { ign: true } } } } },
    })
    return res.status(200).json(batches.map(({ codes, ...batch }) => ({
      ...batch,
      total: codes.length,
      claimed: codes.filter(x => x.ownerId !== null).length,
      claimants: codes.filter(x => x.ownerId !== null).map(x => ({ ign: x.owner?.ign ?? "Deleted account", claimedAt: x.claimedAt })),
    })))
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  const { title, expiresAt, codes, codesFormat } = req.body || {}
  const cleanTitle = typeof title === "string" ? title.trim() : ""
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : new Date(NaN)
  const lines = typeof codes === "string" ? codes.split(/[\r\n,]+/).map(x => x.trim()).filter(Boolean) : []
  const unique = [...new Set(lines)]
  if (!cleanTitle || cleanTitle.length > 120 || !Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
    return res.status(400).json({ error: "Provide a title and a future expiry date" })
  }
  if (!unique.length || unique.length > 10000 || lines.length !== unique.length || unique.some(x => x.length > 256 || /\s/.test(x))) {
    return res.status(400).json({ error: "Supply 1–10,000 distinct redemption codes, one per line" })
  }
  const slug = randomUUID()
  try {
    const batch = await prisma.giftBatch.create({
      data: { title: cleanTitle, slug, expiresAt: expiry, codes: { create: unique.map(code => ({ code })) } },
      select: { id: true, slug: true, title: true },
    })
    return res.status(201).json(batch)
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "One or more codes have already been uploaded" })
    console.error("Gift batch upload failed", error)
    return res.status(500).json({ error: "Failed to create batch" })
  }
}
