const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/pokedexImportCleanup", () => ({
  deletePokedexImportCompletely: jest.fn(),
}))

jest.mock("../../lib/prisma", () => ({
  tradeNotification: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  friendCodeGrabNotification: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  pokedexImportJob: {
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
const friendCodeItemHandler = require("../../pages/api/friend-code-grabs/[id]").default

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
        notificationDismissedAt: null,
      },
    })
  })

  it("marks all current visible notifications as read", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.updateMany.mockResolvedValueOnce({ count: 2 })
    prisma.friendCodeGrabNotification.updateMany.mockResolvedValueOnce({ count: 1 })
    prisma.pokedexImportJob.updateMany.mockResolvedValueOnce({ count: 1 })
    const { req, res } = createMocks({ method: "PUT" })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ updated: 4, unreadCount: 0 })
    expect(prisma.pokedexImportJob.updateMany).toHaveBeenCalledWith({
      where: {
        ownerId: 12,
        status: { in: ["COMPLETE", "FAILED"] },
        notificationReadAt: null,
        notificationDismissedAt: null,
      },
      data: { notificationReadAt: expect.any(Date) },
    })
  })

  it("returns only non-dismissed Pokédex import notifications", async () => {
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
        pushError: null,
        createdAt: new Date("2026-08-19T10:00:00Z"),
        completedAt: new Date("2026-08-19T10:00:30Z"),
        notificationReadAt: null,
      },
    ])

    const { req, res } = createMocks({ method: "GET", query: {} })
    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(prisma.pokedexImportJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerId: 12,
          status: { in: ["COMPLETE", "FAILED", "ACCEPTED"] },
          notificationDismissedAt: null,
        },
      }),
    )
  })

  it("deletes a trade notification when it is clicked through", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.findFirst.mockResolvedValueOnce({ id: 44 })
    prisma.tradeNotification.delete.mockResolvedValueOnce({ id: 44 })
    const { req, res } = createMocks({
      method: "DELETE",
      query: { id: "44" },
    })

    await itemHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(prisma.tradeNotification.delete).toHaveBeenCalledWith({
      where: { id: 44 },
    })
  })

  it("deletes a friend-code notification when it is clicked through", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.friendCodeGrabNotification.findFirst.mockResolvedValueOnce({ id: 55 })
    prisma.friendCodeGrabNotification.delete.mockResolvedValueOnce({ id: 55 })
    const { req, res } = createMocks({
      method: "DELETE",
      query: { id: "55" },
    })

    await friendCodeItemHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(prisma.friendCodeGrabNotification.delete).toHaveBeenCalledWith({
      where: { id: 55 },
    })
  })

  it("does not allow a user to modify another user's trade notification", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.tradeNotification.findFirst.mockResolvedValueOnce(null)
    const { req, res } = createMocks({
      method: "DELETE",
      query: { id: "44" },
    })

    await itemHandler(req, res)

    expect(res._getStatusCode()).toBe(404)
    expect(prisma.tradeNotification.delete).not.toHaveBeenCalled()
  })
})
