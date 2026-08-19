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
  friendCodeGrabNotification: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  pokedexImportJob: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
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

  it("returns the combined private unread count including completed Pokédex imports", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.count.mockResolvedValueOnce(3)
    prisma.friendCodeGrabNotification.count.mockResolvedValueOnce(2)
    prisma.pokedexImportJob.count.mockResolvedValueOnce(1)
    const { req, res } = createMocks({
      method: "GET",
      query: { summary: "1" },
    })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ unreadCount: 6 })
    expect(prisma.tradeNotification.count).toHaveBeenCalledWith({
      where: { ownerId: 12, readAt: null },
    })
    expect(prisma.friendCodeGrabNotification.count).toHaveBeenCalledWith({
      where: { ownerId: 12, readAt: null },
    })
    expect(prisma.pokedexImportJob.count).toHaveBeenCalledWith({
      where: {
        ownerId: 12,
        status: { in: ["COMPLETE", "FAILED"] },
        notificationReadAt: null,
      },
    })
    expect(prisma.tradeNotification.findMany).not.toHaveBeenCalled()
    expect(prisma.friendCodeGrabNotification.findMany).not.toHaveBeenCalled()
    expect(prisma.pokedexImportJob.findMany).not.toHaveBeenCalled()
  })

  it("marks all of the current user's unread notifications as read", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.updateMany.mockResolvedValueOnce({ count: 2 })
    prisma.friendCodeGrabNotification.updateMany.mockResolvedValueOnce({ count: 1 })
    prisma.pokedexImportJob.updateMany.mockResolvedValueOnce({ count: 1 })
    const { req, res } = createMocks({ method: "PUT" })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ updated: 4, unreadCount: 0 })
    expect(prisma.tradeNotification.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 12, readAt: null },
      data: { readAt: expect.any(Date) },
    })
    expect(prisma.friendCodeGrabNotification.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 12, readAt: null },
      data: { readAt: expect.any(Date) },
    })
    expect(prisma.pokedexImportJob.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 12,
        status: { in: ["COMPLETE", "FAILED"] },
        notificationReadAt: null,
      },
      data: { notificationReadAt: expect.any(Date) },
    })
  })

  it("returns Pokédex import notifications in the private inbox", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.count.mockResolvedValueOnce(0)
    prisma.friendCodeGrabNotification.count.mockResolvedValueOnce(0)
    prisma.pokedexImportJob.count.mockResolvedValueOnce(1)
    prisma.tradeNotification.findMany.mockResolvedValueOnce([])
    prisma.friendCodeGrabNotification.findMany.mockResolvedValueOnce([])
    prisma.pokedexImportJob.findMany.mockResolvedValueOnce([
      {
        id: 77,
        status: "COMPLETE",
        totalImages: 3,
        error: null,
        pushError: "No push subscription is registered for this account.",
        createdAt: new Date("2026-08-19T10:00:00Z"),
        completedAt: new Date("2026-08-19T10:00:30Z"),
        notificationReadAt: null,
      },
    ])

    const { req, res } = createMocks({ method: "GET", query: {} })
    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    const body = JSON.parse(res._getData())
    expect(body.unreadCount).toBe(1)
    expect(body.notifications).toEqual([
      expect.objectContaining({
        kind: "POKEDEX_IMPORT",
        id: 77,
        jobId: 77,
        status: "COMPLETE",
        totalImages: 3,
        readAt: null,
      }),
    ])
  })

  it("does not allow a user to mark another user's trade notification as read", async () => {
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
