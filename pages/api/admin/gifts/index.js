import { randomUUID } from "node:crypto"
import { parse } from "csv-parse/sync"
import { getServerSession } from "next-auth/next"
import prisma from "../../../../lib/prisma"
import { authOptions } from "../../auth/[...nextauth]"

export function parseGiftCodes(value, format = "text") {
  if (typeof value !== "string") throw new Error("Provide redemption codes")
  if (format !== "csv") return value.split(/[\r\n,]+/).map(x => x.trim()).filter(Boolean)
  let rows
  try {
    rows = parse(value.replace(/^\uFEFF/, ""), { skip_empty_lines: true, relax_quotes: false, relax_column_count: true, trim: true })
  } catch {
    throw new Error("Invalid CSV file")
  }
  if (!rows.length) return []
  const headers = rows[0].map(x => x.toLowerCase().trim())
  const codeIndex = headers.findIndex(x => ["code", "redemption code", "redemption_code", "offer code", "gift code", "passcode"].includes(x))
  // A named Code column means other columns contain metadata, not gift codes.
  if (codeIndex >= 0) {
    if (rows.slice(1).some(row => row.length <= codeIndex || !row[codeIndex].trim())) {
      throw new Error("CSV rows have missing redemption codes")
    }
    return rows.slice(1).map(row => row[codeIndex].trim())
  }
  // Headerless uploads can be one code per row, comma-separated lists,
  // or a mix of both. In this case every non-empty cell is a gift code.
  return rows.flatMap(row => row.map(code => code.trim()).filter(Boolean))
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (session?.user?.role !== "admin") return res.status(403).json({ error: "Admin only" })
  if (req.method === "GET") {
    const batches = await prisma.giftBatch.findMany({
      orderBy: { createdAt: "desc" },
      include: { codes: { select: { id: true, ownerId: true, claimedAt: true, owner: { select: { ign: true } } } } },
    })
    const claimedIds = batches.flatMap(batch => batch.codes.filter(code => code.claimedAt).map(code => code.id))
    const audits = claimedIds.length
      ? await prisma.giftClaimAudit.findMany({
          where: { giftCodeId: { in: claimedIds } },
          select: { giftCodeId: true, claimantIgn: true, claimedAt: true },
        })
      : []
    const names = new Map(audits.map(audit => [audit.giftCodeId, audit.claimantIgn]))
    return res.status(200).json(batches.map(({ codes, ...batch }) => ({
      ...batch,
      total: codes.length,
      claimed: codes.filter(code => code.claimedAt !== null).length,
      claimants: codes.filter(code => code.claimedAt !== null).map(code => ({
        ign: names.get(code.id) ?? code.owner?.ign ?? "Deleted account",
        claimedAt: code.claimedAt,
      })),
    })))
  }
  if (req.method === "DELETE") {
    const { batchId, mode, confirmation, codes } = req.body || {}
    if (typeof batchId !== "string" || !batchId) return res.status(400).json({ error: "Select a gift batch" })
    try {
      const batch = await prisma.giftBatch.findUnique({ where: { id: batchId }, select: { id: true, title: true } })
      if (!batch) return res.status(404).json({ error: "Gift batch not found" })

      if (mode === "batch") {
        if (confirmation !== `DELETE ${batch.title}`) {
          return res.status(400).json({ error: "Enter the full confirmation phrase to delete this batch" })
        }
        const deletedCodes = await prisma.giftCode.count({ where: { batchId } })
        // GiftCode rows are deleted by the GiftBatch relation's onDelete: Cascade.
        // The independent GiftClaimAudit records remain intact.
        await prisma.giftBatch.delete({ where: { id: batchId } })
        return res.status(200).json({ deletedBatch: true, deletedCodes })
      }

      if (mode === "codes") {
        if (confirmation !== "DELETE") return res.status(400).json({ error: "Confirm deletion of selected codes" })
        const list = parseGiftCodes(codes)
        const unique = [...new Set(list)]
        if (!list.length || list.length > 10000 || unique.length !== list.length || unique.some(code => code.length > 256 || /\s/.test(code))) {
          return res.status(400).json({ error: "Paste 1–10,000 distinct valid codes to remove" })
        }
        // Only delete exact matches in the selected batch. No partial deletion:
        // a typo must not silently delete just some of the submitted codes.
        const matched = await prisma.giftCode.findMany({
          where: { batchId, code: { in: unique } },
          select: { ownerId: true },
        })
        if (matched.length !== unique.length) {
          return res.status(404).json({ error: "One or more codes were not found in this batch; no codes removed" })
        }
        const removed = await prisma.giftCode.deleteMany({ where: { batchId, code: { in: unique } } })
        return res.status(200).json({
          deletedBatch: false,
          deletedCodes: removed.count,
          deletedClaims: 0,
          preservedAuditEntries: matched.filter(code => code.ownerId !== null).length,
        })
      }
      return res.status(400).json({ error: "Choose whether to delete a batch or specific codes" })
    } catch (error) {
      console.error("Gift code deletion failed", error)
      return res.status(500).json({ error: "Unable to delete gift codes" })
    }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  const { title, expiresAt, codes, codesFormat } = req.body || {}
  const cleanTitle = typeof title === "string" ? title.trim() : ""
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : new Date(NaN)
  let lines
  try {
    lines = parseGiftCodes(codes, codesFormat)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
  const unique = [...new Set(lines)]
  if (!cleanTitle || cleanTitle.length > 120 || !Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
    return res.status(400).json({ error: "Provide a title and a future expiry date" })
  }
  if (!unique.length || unique.length > 10000 || lines.length !== unique.length || unique.some(x => x.length > 256 || /\s/.test(x))) {
    return res.status(400).json({ error: "Supply 1–10,000 distinct redemption codes (comma-separated or one per line)" })
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
