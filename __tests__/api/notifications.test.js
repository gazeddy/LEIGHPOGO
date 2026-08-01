const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/prisma", () => ({
  tradeNotification: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
}))

const prisma = require("../../lib/prisma")
const collectionHandler = require("../../pages/api/notifications").default
const itemHandler = require("../../pages/api/notifications/[id]").default

beforeEach(() => {
  jest.clearAllMocks()
})

describe("notifications API", () => {
  it("returns 401 to logged-out visitors", async () => {
    getServerSession.mockResolvedValueOnce(null)
    const { req, res } = createMocks({ method: "GET" })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(401)
  })

  it("returns only the private unread count for navbar summaries", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.count.mockResolvedValueOnce(3)
    const { req, res } = createMocks({
      method: "GET",
      query: { summary: "1" },
    })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ unreadCount: 3 })
    expect(prisma.tradeNotification.count).toHaveBeenCalledWith({
      where: { ownerId: 12, readAt: null },
    })
    expect(prisma.tradeNotification.findMany).not.toHaveBeenCalled()
  })

  it("marks all of the current user's unread notifications as read", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.updateMany.mockResolvedValueOnce({ count: 2 })
    const { req, res } = createMocks({ method: "PUT" })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ updated: 2, unreadCount: 0 })
    expect(prisma.tradeNotification.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 12, readAt: null },
      data: { readAt: expect.any(Date) },
    })
  })

  it("does not allow a user to mark another user's notification as read", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.findFirst.mockResolvedValueOnce(null)
    const { req, res } = createMocks({
      method: "PUT",
      query: { id: "44" },
    })

    await itemHandler(req, res)

    expect(res._getStatusCode()).toBe(404)
    expect(prisma.tradeNotification.findFirst).toHaveBeenCalledWith({
      where: { id: 44, ownerId: 12 },
      select: { id: true },
    })
    expect(prisma.tradeNotification.update).not.toHaveBeenCalled()
  })
})
