const fs = require("fs")
const path = require("path")

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}))

const prisma = require("../lib/prisma").default
const {
  getAuthenticatedUser,
  getEligibleTradeUser,
} = require("../lib/tradeServer")

const session = {
  user: {
    id: 42,
    ign: "NoCodeTrainer",
    role: "user",
  },
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("wanted trade access", () => {
  it("recognises a registered user without a friend code", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      ign: "NoCodeTrainer",
      role: "user",
      entries: [],
    })

    await expect(getAuthenticatedUser(session)).resolves.toEqual({
      id: 42,
      ign: "NoCodeTrainer",
      role: "user",
      friendCode: null,
    })
  })

  it("keeps full trade-listing eligibility dependent on a friend code", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      ign: "NoCodeTrainer",
      role: "user",
      entries: [],
    })

    await expect(getEligibleTradeUser(session)).resolves.toBeNull()
  })

  it("uses registered-user access throughout the wanted board", () => {
    const files = [
      "pages/trades/wanted.js",
      "pages/api/trades/wanted/index.js",
      "pages/api/trades/wanted/[id].js",
    ].map((file) =>
      fs.readFileSync(path.join(process.cwd(), file), "utf8"),
    )

    for (const source of files) {
      expect(source).toContain("getAuthenticatedUser")
      expect(source).not.toContain("getEligibleTradeUser")
      expect(source).not.toContain("FRIEND_CODE_REQUIRED")
    }

    expect(files[0]).not.toContain('destination: "/friend-codes"')
  })
})
