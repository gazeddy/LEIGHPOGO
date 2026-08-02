process.env.DATABASE_URL =
  process.env.DATABASE_URL || "file:entry-edit-tests?mode=memory&cache=shared"

const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    entry: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

const prisma = require("../../lib/prisma").default
const ownerHandler = require("../../pages/api/entries/[id]").default
const adminHandler = require("../../pages/api/admin/entries/[id]").default

beforeEach(() => {
  jest.clearAllMocks()
})

describe("friend-code entry editing", () => {
  it("allows an owner whose session ID is a string to update their entry", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "42", ign: "misty", role: "user" },
    })
    prisma.entry.findUnique.mockResolvedValueOnce({
      id: 7,
      ownerId: 42,
      trainerName: "Misty",
      code: "",
    })
    prisma.entry.update.mockResolvedValueOnce({
      id: 7,
      ownerId: 42,
      trainerName: "Misty",
      code: "1234 5678 9012",
    })

    const { req, res } = createMocks({
      method: "PATCH",
      query: { id: "7" },
      body: {
        trainerName: "Misty",
        friendCode: "1234-5678-9012",
      },
    })

    await ownerHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(prisma.entry.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        trainerName: "Misty",
        code: "1234 5678 9012",
      },
    })
  })

  it("allows an admin form update and stores the canonical code", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "1", ign: "admin", role: "admin" },
    })
    prisma.entry.update.mockResolvedValueOnce({
      id: 9,
      ownerId: 42,
      trainerName: "Brock",
      code: "9876 5432 1098",
    })

    const { req, res } = createMocks({
      method: "PUT",
      query: { id: "9" },
      body: {
        trainerName: " Brock ",
        friendCode: "987654321098",
      },
    })

    await adminHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(prisma.entry.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: {
        trainerName: "Brock",
        code: "9876 5432 1098",
      },
    })
  })

  it("returns a useful validation error for an incomplete code", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: "1", ign: "admin", role: "admin" },
    })

    const { req, res } = createMocks({
      method: "PUT",
      query: { id: "9" },
      body: {
        trainerName: "Brock",
        friendCode: "1234 5678",
      },
    })

    await adminHandler(req, res)

    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData()).message).toContain("exactly 12 digits")
    expect(prisma.entry.update).not.toHaveBeenCalled()
  })
})
