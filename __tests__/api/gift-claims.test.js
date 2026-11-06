import handler from "../../pages/api/gifts/[slug]"
import prisma from "../../lib/prisma"
import { getServerSession } from "next-auth/next"

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }))
jest.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }))
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: { giftBatch: { findUnique: jest.fn() }, giftCode: { findFirst: jest.fn(), count: jest.fn(), updateMany: jest.fn() } },
}))

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
}
const batch = { id: "batch1", title: "Community gift", expiresAt: new Date("2099-01-01") }
beforeEach(() => {
  jest.resetAllMocks()
  prisma.giftBatch.findUnique.mockResolvedValue(batch)
  getServerSession.mockResolvedValue({ user: { id: 42, role: "user", privacyPolicyAccepted: true } })
  prisma.giftCode.count.mockResolvedValue(1)
})
test("anonymous visitors cannot view or allocate codes", async () => {
  getServerSession.mockResolvedValue(null)
  const res = makeRes()
  await handler({ method: "POST", query: { slug: "abc" } }, res)
  expect(res.status).toHaveBeenCalledWith(401)
  expect(prisma.giftCode.findFirst).not.toHaveBeenCalled()
})
test("a repeat claimant sees their original allocation", async () => {
  prisma.giftCode.findFirst.mockResolvedValue({ code: "REDEEM-1", claimedAt: new Date() })
  const res = makeRes()
  await handler({ method: "POST", query: { slug: "abc" } }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ claim: expect.objectContaining({ code: "REDEEM-1" }) }))
  expect(prisma.giftCode.updateMany).not.toHaveBeenCalled()
})
test("fresh claim uses conditional single-code allocation", async () => {
  prisma.giftCode.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 77 }).mockResolvedValueOnce({ code: "REDEEM-2" })
  // findFirst is used by both existing() and selecting an available record.
  prisma.giftCode.updateMany.mockResolvedValue({ count: 1 })
  const res = makeRes()
  await handler({ method: "POST", query: { slug: "abc" } }, res)
  expect(prisma.giftCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ id: 77, batchId: "batch1", ownerId: null }),
    data: expect.objectContaining({ ownerId: 42 }),
  }))
})
test("expired batches never allocate new claims", async () => {
  prisma.giftBatch.findUnique.mockResolvedValue({ ...batch, expiresAt: new Date("2000-01-01") })
  prisma.giftCode.findFirst.mockResolvedValue(null)
  const res = makeRes()
  await handler({ method: "POST", query: { slug: "abc" } }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ expired: true, claim: null }))
  expect(prisma.giftCode.updateMany).not.toHaveBeenCalled()
})
