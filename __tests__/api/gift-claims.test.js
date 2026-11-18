import handler from "../../pages/api/gifts"
import prisma from "../../lib/prisma"
import { getServerSession } from "next-auth/next"
import { validGiftQr } from "../../lib/giftQr"

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }))
jest.mock("../../lib/giftQr", () => ({ validGiftQr: jest.fn() }))
jest.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }))
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    giftCode: { findFirst: jest.fn(), count: jest.fn() },
    giftClaimAudit: { findFirst: jest.fn(), create: jest.fn() },
  },
}))

const issued = {
  id: 1, giftCodeId: 10, code: "CODE-1",
  claimantIgn: "Trainer42", claimantIgnKey: "trainer42", claimantUserId: 42,
  claimedAt: new Date(), batchTitle: "Early expiry batch",
  batchExpiresAt: new Date("2026-11-20T00:00:00Z"),
}
const allocated = {
  id: 10, code: "CODE-1",
  batch: { title: "Early expiry batch", expiresAt: issued.batchExpiresAt },
}
function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
}
beforeEach(() => {
  jest.resetAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 42, privacyPolicyAccepted: true } })
  validGiftQr.mockReturnValue(true)
  prisma.user.findUnique.mockResolvedValue({ ign: "Trainer42" })
  prisma.giftCode.count.mockResolvedValue(2)
  prisma.giftClaimAudit.findFirst.mockResolvedValue(null)
  prisma.$executeRaw.mockResolvedValue(1)
  prisma.giftCode.findFirst.mockResolvedValue(allocated)
  prisma.giftClaimAudit.create.mockResolvedValue(issued)
  prisma.$transaction.mockImplementation(fn => fn(prisma))
})

test("expired QR never allocates", async () => {
  validGiftQr.mockReturnValue(false)
  const res = makeRes()
  await handler({ method: "POST", body: { qr: "expired" } }, res)
  expect(res.status).toHaveBeenCalledWith(410)
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("anonymous scans cannot claim codes", async () => {
  getServerSession.mockResolvedValue(null)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.status).toHaveBeenCalledWith(401)
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("a claim within 24 hours returns the audited code without allocation", async () => {
  prisma.giftClaimAudit.findFirst.mockResolvedValue(issued)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    claim: expect.objectContaining({ code: "CODE-1", batchTitle: "Early expiry batch" }),
  }))
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("first claim atomically allocates an unclaimed code and stores its audit", async () => {
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  const sql = prisma.$executeRaw.mock.calls[0][0].join(" ")
  expect(sql).toMatch(/gc\."claimedAt" IS NULL/)
  expect(sql).toMatch(/ORDER BY gb\."expiresAt" ASC/)
  expect(sql).toMatch(/NOT EXISTS/)
  expect(sql).toMatch(/recent\."claimantIgnKey"/)
  expect(prisma.giftClaimAudit.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      claimantIgn: "Trainer42", claimantIgnKey: "trainer42", claimantUserId: 42, code: "CODE-1",
    }),
  })
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    claim: expect.objectContaining({
      code: "CODE-1",
      redeemUrl: "https://store.pokemongo.com/offer-redemption?passcode=CODE-1",
    }),
  }))
})
test("GET never allocates a code", async () => {
  const res = makeRes()
  await handler({ method: "GET" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ claim: null, remaining: 2 }))
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("nothing available returns no claim and no audit", async () => {
  prisma.$executeRaw.mockResolvedValue(0)
  prisma.giftCode.count.mockResolvedValue(0)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ claim: null, remaining: 0 }))
  expect(prisma.giftClaimAudit.create).not.toHaveBeenCalled()
})
test("a 25-hour-old claim permits another code", async () => {
  const old = { ...issued, claimedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
  prisma.giftClaimAudit.findFirst.mockResolvedValueOnce(old)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canClaim: false }))
})
test("a deleted and re-registered account with the same IGN retains cooldown", async () => {
  getServerSession.mockResolvedValue({ user: { id: 99, privacyPolicyAccepted: true } })
  prisma.giftClaimAudit.findFirst.mockResolvedValue({
    ...issued, claimantUserId: 42, claimedAt: new Date(),
  })
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.giftClaimAudit.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { OR: [{ claimantUserId: 99 }, { claimantIgnKey: "trainer42" }] },
  }))
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ canClaim: false }))
})
