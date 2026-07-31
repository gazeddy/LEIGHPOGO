/**
 * Integration tests for /api/trades.
 * Run with: npm test
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL || "file:trade-tests?mode=memory&cache=shared"

const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

const prisma = require("../../lib/prisma")
const handler = require("../../pages/api/trades").default

const ensureSchema = async () => {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON")
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "TradeListingItem"')
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "TradeListing"')
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "Entry"')
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "User"')

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT,
      "ign" TEXT NOT NULL UNIQUE,
      "password" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'user'
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "Entry" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "trainerName" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "team" TEXT NOT NULL DEFAULT 'MYSTIC',
      "ownerId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Entry_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "TradeListing" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "ownerId" INTEGER NOT NULL,
      "location" TEXT,
      "notes" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      CONSTRAINT "TradeListing_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "TradeListingItem" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "listingId" INTEGER NOT NULL,
      "direction" TEXT NOT NULL,
      "pokemonName" TEXT NOT NULL,
      "shiny" BOOLEAN NOT NULL DEFAULT false,
      "costume" BOOLEAN NOT NULL DEFAULT false,
      "background" BOOLEAN NOT NULL DEFAULT false,
      "dynamax" BOOLEAN NOT NULL DEFAULT false,
      "gigantamax" BOOLEAN NOT NULL DEFAULT false,
      "notes" TEXT,
      CONSTRAINT "TradeListingItem_listingId_fkey" FOREIGN KEY ("listingId")
        REFERENCES "TradeListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
}

const createUser = async ({ withFriendCode = true } = {}) => {
  const user = await prisma.user.create({
    data: {
      ign: withFriendCode ? "brock" : "jessie",
      password: "hashed",
      role: "user",
    },
  })

  if (withFriendCode) {
    await prisma.entry.create({
      data: {
        trainerName: user.ign,
        code: "1111 2222 3333",
        ownerId: user.id,
      },
    })
  }

  return user
}

beforeAll(async () => {
  await ensureSchema()
})

beforeEach(async () => {
  await prisma.tradeListingItem.deleteMany()
  await prisma.tradeListing.deleteMany()
  await prisma.entry.deleteMany()
  await prisma.user.deleteMany()
  jest.clearAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("POST /api/trades", () => {
  it("returns 401 to logged-out visitors", async () => {
    getServerSession.mockResolvedValueOnce(null)
    const { req, res } = createMocks({ method: "POST", body: {} })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(401)
  })

  it("requires a friend code stored against the account", async () => {
    const user = await createUser({ withFriendCode: false })
    getServerSession.mockResolvedValueOnce({
      user: { id: user.id, ign: user.ign, role: user.role },
    })
    const { req, res } = createMocks({ method: "POST", body: {} })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(403)
    expect(JSON.parse(res._getData()).code).toBe("FRIEND_CODE_REQUIRED")
  })

  it("creates a listing that expires one calendar month later", async () => {
    const user = await createUser()
    getServerSession.mockResolvedValueOnce({
      user: { id: user.id, ign: user.ign, role: user.role },
    })

    const { req, res } = createMocks({
      method: "POST",
      body: {
        location: "Leigh town centre",
        notes: "Available evenings",
        offeredItems: [{ pokemonName: "Mewtwo", shiny: true }],
        wantedItems: [{ pokemonName: "Rayquaza" }],
      },
    })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(201)
    const payload = JSON.parse(res._getData())
    expect(payload.items).toHaveLength(2)

    const createdAt = new Date(payload.createdAt)
    const expiresAt = new Date(payload.expiresAt)
    expect(expiresAt.getTime()).toBeGreaterThan(createdAt.getTime() + 27 * 86400000)
    expect(expiresAt.getTime()).toBeLessThan(createdAt.getTime() + 32 * 86400000)
  })
})

describe("GET /api/trades", () => {
  it("removes expired listings before returning active trades", async () => {
    const user = await createUser()
    await prisma.tradeListing.create({
      data: {
        ownerId: user.id,
        expiresAt: new Date(Date.now() - 1000),
        items: {
          create: [
            { direction: "OFFER", pokemonName: "Pikachu" },
            { direction: "WANT", pokemonName: "Eevee" },
          ],
        },
      },
    })

    getServerSession.mockResolvedValueOnce({
      user: { id: user.id, ign: user.ign, role: user.role },
    })
    const { req, res } = createMocks({ method: "GET" })

    await handler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(JSON.parse(res._getData()).listings).toEqual([])
    expect(await prisma.tradeListing.count()).toBe(0)
  })
})
