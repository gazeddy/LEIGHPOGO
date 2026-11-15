import handler from "../../pages/api/admin/gifts"
import prisma from "../../lib/prisma"
import { getServerSession } from "next-auth/next"

jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }))
jest.mock("../../pages/api/auth/[...nextauth]", () => ({ authOptions: {} }))
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    giftBatch: { findUnique: jest.fn(), delete: jest.fn() },
    giftCode: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  },
}))

const makeRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() })
const request = (body) => ({ method: "DELETE", body })

beforeEach(() => {
  jest.resetAllMocks()
  getServerSession.mockResolvedValue({ user: { role: "admin", id: "42" } })
  prisma.giftBatch.findUnique.mockResolvedValue({ id: "batch-1", title: "Test batch" })
  prisma.giftCode.count.mockResolvedValue(3)
  prisma.giftCode.deleteMany.mockResolvedValue({ count: 2 })
})

test("non-admins cannot delete any gift codes", async () => {
  getServerSession.mockResolvedValue({ user: { role: "user", id: "19" } })
  const res = makeRes()
  await handler(request({ mode: "batch", batchId: "batch-1", confirmation: "DELETE Test batch" }), res)
  expect(res.status).toHaveBeenCalledWith(403)
  expect(prisma.giftBatch.delete).not.toHaveBeenCalled()
  expect(prisma.giftCode.deleteMany).not.toHaveBeenCalled()
})

test("deleting a whole batch requires its exact name", async () => {
  const res = makeRes()
  await handler(request({ mode: "batch", batchId: "batch-1", confirmation: "DELETE" }), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(prisma.giftBatch.delete).not.toHaveBeenCalled()
})

test("confirmed batch deletion removes its codes via the cascade", async () => {
  const res = makeRes()
  await handler(request({ mode: "batch", batchId: "batch-1", confirmation: "DELETE Test batch" }), res)
  expect(prisma.giftBatch.delete).toHaveBeenCalledWith({ where: { id: "batch-1" } })
  expect(res.json).toHaveBeenCalledWith({ deletedBatch: true, deletedCodes: 3 })
})

test("specific-code deletion rejects an unknown code without removing any", async () => {
  prisma.giftCode.findMany.mockResolvedValue([{ ownerId: null }])
  const res = makeRes()
  await handler(request({ mode: "codes", batchId: "batch-1", codes: "EXISTS,MISSING", confirmation: "DELETE" }), res)
  expect(res.status).toHaveBeenCalledWith(404)
  expect(prisma.giftCode.deleteMany).not.toHaveBeenCalled()
})

test("specific-code deletion only removes requested exact codes from the selected batch", async () => {
  prisma.giftCode.findMany.mockResolvedValue([{ ownerId: null }, { ownerId: 12 }])
  const res = makeRes()
  await handler(request({ mode: "codes", batchId: "batch-1", codes: "CODE1, CODE2", confirmation: "DELETE" }), res)
  const where = { batchId: "batch-1", code: { in: ["CODE1", "CODE2"] } }
  expect(prisma.giftCode.findMany).toHaveBeenCalledWith({ where, select: { ownerId: true } })
  expect(prisma.giftCode.deleteMany).toHaveBeenCalledWith({ where })
  expect(res.json).toHaveBeenCalledWith({ deletedBatch: false, deletedCodes: 2, deletedClaims: 1 })
})

test("cannot remove codes without explicit confirmation", async () => {
  const res = makeRes()
  await handler(request({ mode: "codes", batchId: "batch-1", codes: "CODE1", confirmation: "" }), res)
  expect(res.status).toHaveBeenCalledWith(400)
  expect(prisma.giftCode.deleteMany).not.toHaveBeenCalled()
})

test("duplicate and whitespace-containing codes are rejected", async () => {
  for (const codes of ["CODE1,CODE1", "CODE 1"]) {
    const res = makeRes()
    await handler(request({ mode: "codes", batchId: "batch-1", codes, confirmation: "DELETE" }), res)
    expect(res.status).toHaveBeenCalledWith(400)
  }
  expect(prisma.giftCode.deleteMany).not.toHaveBeenCalled()
})
