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
  claimedAt: new Date(),
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
test("a claim within 24 hours returns its existing code without allocation", async () => {
  prisma.giftCode.findFirst.mockResolvedValue(assigned)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    claim: expect.objectContaining({ code: "CODE-1", batchTitle: "Early expiry batch" }),
  }))
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
})
test("first daily claim issues through atomic earliest-expiry SQL", async () => {
  prisma.giftCode.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(assigned)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  const sql = prisma.$executeRaw.mock.calls[0][0].join(" ")
  expect(sql).toMatch(/ORDER BY gb\."expiresAt" ASC/)
  expect(sql).toMatch(/NOT EXISTS/)
  expect(sql).toMatch(/recent\."claimedAt" >/)
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

test("a 25-hour-old claim permits another code, even within the same batch", async () => {
  const old = { ...assigned, claimedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }
  prisma.giftCode.findFirst.mockResolvedValueOnce(old).mockResolvedValueOnce({
    ...assigned,
    code: "CODE-2",
  })
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    claim: expect.objectContaining({ code: "CODE-2" }),
    canClaim: false,
  }))
})
test("the cooldown is rolling, not reset at midnight", async () => {
  prisma.giftCode.findFirst.mockResolvedValue(assigned)
  const res = makeRes()
  await handler({ method: "POST" }, res)
  expect(prisma.$executeRaw).not.toHaveBeenCalled()
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    canClaim: false,
    nextClaimAt: new Date(assigned.claimedAt.getTime() + 24 * 60 * 60 * 1000),
  }))
})
