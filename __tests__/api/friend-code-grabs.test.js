const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/prisma", () => ({
  entry: {
    findUnique: jest.fn(),
  },
  friendCodeGrabNotification: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
}))

const prisma = require("../../lib/prisma")
const handler = require("../../pages/api/friend-code-grabs").default

beforeEach(() => {
  jest.clearAllMocks()
})

const mockNotification = {
  id: 9,
  createdAt: new Date("2026-08-16T08:30:00.000Z"),
  readAt: null,
  copiedBy: {
    id: 12,
    ign: "CopyingTrainer",
  },
  entry: {
    id: 44,
    trainerName: "CodeOwner",
  },
}

describe("friend code grab API", () => {
  it("requires a logged-in user", async () => {
    getServerSession.mockResolvedValueOnce(null)
    const { req, res } = createMocks({
      method: "POST",
      body: { entryId: 44 },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(401)
  })

  it("does not notify a user when they copy their own friend code", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.entry.findUnique.mockResolvedValueOnce({
      id: 44,
      ownerId: 12,
      trainerName: "MyTrainer",
    })
    const { req, res } = createMocks({
      method: "POST",
      body: { entryId: 44 },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData())).toEqual({ created: false, self: true })
    expect(prisma.friendCodeGrabNotification.findFirst).not.toHaveBeenCalled()
    expect(prisma.friendCodeGrabNotification.create).not.toHaveBeenCalled()
  })

  it("deduplicates repeated copies by the same trainer within five minutes", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.entry.findUnique.mockResolvedValueOnce({
      id: 44,
      ownerId: 21,
      trainerName: "CodeOwner",
    })
    prisma.friendCodeGrabNotification.findFirst.mockResolvedValueOnce(mockNotification)
    const { req, res } = createMocks({
      method: "POST",
      body: { entryId: 44 },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData()).created).toBe(false)
    expect(prisma.friendCodeGrabNotification.create).not.toHaveBeenCalled()
  })

  it("creates an in-app notification for a different logged-in trainer", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.entry.findUnique.mockResolvedValueOnce({
      id: 44,
      ownerId: 21,
      trainerName: "CodeOwner",
    })
    prisma.friendCodeGrabNotification.findFirst.mockResolvedValueOnce(null)
    prisma.friendCodeGrabNotification.create.mockResolvedValueOnce(mockNotification)
    const { req, res } = createMocks({
      method: "POST",
      body: { entryId: 44 },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(201)
    expect(JSON.parse(res._getData())).toMatchObject({
      created: true,
      notification: {
        kind: "FRIEND_CODE_GRAB",
        copiedBy: {
          id: 12,
          ign: "CopyingTrainer",
        },
        entry: {
          id: 44,
          trainerName: "CodeOwner",
        },
      },
    })
    expect(prisma.friendCodeGrabNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ownerId: 21,
          copiedById: 12,
          entryId: 44,
        },
      }),
    )
  })
})
