import handler from "../../pages/api/gifts"
import prisma from "../../lib/prisma"
import { getServerSession } from "next-auth/next"

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }))
jest.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }))
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    $executeRaw: jest.fn(),
    giftCode: { findFirst: jest.fn(), count: jest.fn() },
  },
}))

const assigned = {
  code: "CODE-1",
  claimedAt: new Date("2026-11-06T10:00:00Z"),
  batch: { title: "Early expiry batch", expiresAt: new Date("2026-11-20T00:00:00Z") },
}
function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
}
beforeEach(() => {
  jest.resetAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 42, privacyPolicyAccepted: true } })
  prisma.giftCode.count.mockResolvedValue(2)
  prisma.$executeRaw.mockResolvedValue(1)
})
test("anonymous scans cannot claim codes", async () => {
  getServerSession.mockResolvedValue(null)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.status).toHaveBeenCalledWith(401)
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("repeat claimant sees the same code without allocating another", async () => {
  prisma.giftCode.findFirst.mockResolvedValue(assigned)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    claim: expect.objectContaining({ code: "CODE-1", batchTitle: "Early expiry batch" }),
  }))
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("fresh claim issues through atomic earliest-expiry SQL", async () => {
  prisma.giftCode.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(assigned)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  const sql = prisma.$executeRaw.mock.calls[0][0].join(" ")
  expect(sql).toMatch(/ORDER BY gb\."expiresAt" ASC/)
  expect(sql).toMatch(/NOT EXISTS/)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    claim: expect.objectContaining({ code: "CODE-1" }),
  }))
})
test("GET never allocates a code", async () => {
  prisma.giftCode.findFirst.mockResolvedValue(null)
  const res = makeRes()
  await handler({ method: "GET" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ claim: null, remaining: 2 }))
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("nothing available returns no claim", async () => {
  prisma.giftCode.findFirst.mockResolvedValue(null)
  prisma.giftCode.count.mockResolvedValue(0)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ claim: null, remaining: 0 }))
})
