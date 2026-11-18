const { createMocks } = require("node-mocks-http")

jest.mock("../../lib/prisma", () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
}))

jest.mock("bcryptjs", () => ({
  hash: jest.fn(async () => "hashed-password"),
}))

const prisma = require("../../lib/prisma")
const handler = require("../../pages/api/auth/register").default
const { PRIVACY_POLICY_VERSION } = require("../../lib/privacyPolicy")

describe("POST /api/auth/register privacy requirements", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue({ id: 1 })
  })

  it("rejects signup when the 13+ confirmation is absent", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        ign: "trainer",
        password: "password123",
        privacyAcknowledged: true,
      },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData()).error).toMatch(/13 or over/i)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("rejects signup when the privacy policy is not acknowledged", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        ign: "trainer",
        password: "password123",
        over13: true,
      },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData()).error).toMatch(/Privacy Policy/i)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("creates the first current-version acknowledgement with the account", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        name: "Trainer",
        ign: "trainer",
        password: "password123",
        over13: true,
        privacyAcknowledged: true,
      },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(201)
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ign: "trainer",
        privacyAcceptances: {
          create: { policyVersion: PRIVACY_POLICY_VERSION },
        },
      }),
    })
  })
})
