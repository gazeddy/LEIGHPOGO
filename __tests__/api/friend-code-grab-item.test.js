const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/prisma", () => ({
  friendCodeGrabNotification: {
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
}))

const prisma = require("../../lib/prisma")
const handler = require("../../pages/api/friend-code-grabs/[id]").default

beforeEach(() => {
  jest.clearAllMocks()
})

describe("friend code grab notification item API", () => {
  it("does not allow a user to delete another user's notification", async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 12 } })
    prisma.friendCodeGrabNotification.findFirst.mockResolvedValueOnce(null)
    const { req, res } = createMocks({
      method: "DELETE",
      query: { id: "44" },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(404)
    expect(prisma.friendCodeGrabNotification.findFirst).toHaveBeenCalledWith({
      where: { id: 44, ownerId: 12 },
      select: { id: true },
    })
    expect(prisma.friendCodeGrabNotification.delete).not.toHaveBeenCalled()
  })
})
