process.env.DATABASE_URL =
  process.env.DATABASE_URL || "file:wanted-trade-tests?mode=memory&cache=shared"

const fs = require("fs")
const path = require("path")
const { createMocks } = require("node-mocks-http")
const { getServerSession } = require("next-auth/next")

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}))

jest.mock("../../lib/releasedPokemonCache", () => ({
  getReleasedPokemonData: jest.fn().mockResolvedValue({
    dexNumbers: [25, 150],
    stale: false,
  }),
}))

const prisma = require("../../lib/prisma")
const collectionHandler = require("../../pages/api/trades/wanted").default
const entryHandler = require("../../pages/api/trades/wanted/[id]").default

const ensureSchema = async () => {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON")
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "WantedTrade"')
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
    CREATE TABLE "WantedTrade" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "ownerId" INTEGER NOT NULL,
      "dexNumber" INTEGER NOT NULL,
      "pokemonName" TEXT NOT NULL,
      "shiny" BOOLEAN NOT NULL DEFAULT false,
      "lucky" BOOLEAN NOT NULL DEFAULT false,
      "xxl" BOOLEAN NOT NULL DEFAULT false,
      "xxs" BOOLEAN NOT NULL DEFAULT false,
      "costume" BOOLEAN NOT NULL DEFAULT false,
      "background" BOOLEAN NOT NULL DEFAULT false,
      "dynamax" BOOLEAN NOT NULL DEFAULT false,
      "gigantamax" BOOLEAN NOT NULL DEFAULT false,
      "notes" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WantedTrade_ownerId_fkey" FOREIGN KEY ("ownerId")
        REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `)
}

const createUser = async ({ ign = "misty", role = "user" } = {}) => {
  const user = await prisma.user.create({
    data: {
      ign,
      password: "hashed",
      role,
    },
  })

  await prisma.entry.create({
    data: {
      trainerName: ign,
      code: "1111 2222 3333",
      ownerId: user.id,
    },
  })

  return user
}

const authenticate = (user) =>
  getServerSession.mockResolvedValueOnce({
    user: { id: user.id, ign: user.ign, role: user.role },
  })

beforeAll(async () => {
  await ensureSchema()
})

beforeEach(async () => {
  await prisma.wantedTrade.deleteMany()
  await prisma.entry.deleteMany()
  await prisma.user.deleteMany()
  jest.clearAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("POST /api/trades/wanted", () => {
  it("returns 401 to logged-out visitors", async () => {
    getServerSession.mockResolvedValueOnce(null)
    const { req, res } = createMocks({ method: "POST", body: {} })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(401)
  })

  it("creates a canonical wanted entry with size and trade modifiers", async () => {
    const user = await createUser()
    authenticate(user)
    const { req, res } = createMocks({
      method: "POST",
      body: {
        dexNumber: 25,
        shiny: true,
        lucky: true,
        xxl: true,
        costume: true,
        notes: "Libre Pikachu",
      },
    })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(201)
    expect(JSON.parse(res._getData())).toMatchObject({
      ownerId: user.id,
      dexNumber: 25,
      pokemonName: "Pikachu",
      shiny: true,
      lucky: true,
      xxl: true,
      xxs: false,
      costume: true,
      notes: "Libre Pikachu",
    })
  })

  it("rejects mutually exclusive XXL and XXS modifiers", async () => {
    const user = await createUser()
    authenticate(user)
    const { req, res } = createMocks({
      method: "POST",
      body: { dexNumber: 25, xxl: true, xxs: true },
    })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(400)
    expect(JSON.parse(res._getData()).error).toContain("both XXL and XXS")
  })

  it("blocks an exact duplicate for the same trainer including Lucky", async () => {
    const user = await createUser()
    await prisma.wantedTrade.create({
      data: {
        ownerId: user.id,
        dexNumber: 150,
        pokemonName: "Mewtwo",
        shiny: true,
        lucky: true,
      },
    })

    authenticate(user)
    const { req, res } = createMocks({
      method: "POST",
      body: { dexNumber: 150, shiny: true, lucky: true },
    })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(409)
  })

  it("allows Lucky and non-Lucky requests as separate modifier combinations", async () => {
    const user = await createUser()
    await prisma.wantedTrade.create({
      data: {
        ownerId: user.id,
        dexNumber: 150,
        pokemonName: "Mewtwo",
        shiny: true,
        lucky: false,
      },
    })

    authenticate(user)
    const { req, res } = createMocks({
      method: "POST",
      body: { dexNumber: 150, shiny: true, lucky: true },
    })

    await collectionHandler(req, res)

    expect(res._getStatusCode()).toBe(201)
    expect(await prisma.wantedTrade.count()).toBe(2)
  })
})

describe("wanted trades page", () => {
  it("offers and displays the Lucky modifier", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "pages/trades/wanted.js"),
      "utf8",
    )

    expect(source).toContain('["lucky", "Lucky"]')
    expect(source).toContain('entry.lucky && "Lucky"')
  })
})

describe("DELETE /api/trades/wanted/:id", () => {
  it("prevents another trainer from removing an entry", async () => {
    const owner = await createUser({ ign: "brock" })
    const otherUser = await createUser({ ign: "jessie" })
    const entry = await prisma.wantedTrade.create({
      data: {
        ownerId: owner.id,
        dexNumber: 25,
        pokemonName: "Pikachu",
      },
    })

    authenticate(otherUser)
    const { req, res } = createMocks({
      method: "DELETE",
      query: { id: String(entry.id) },
    })

    await entryHandler(req, res)

    expect(res._getStatusCode()).toBe(403)
    expect(await prisma.wantedTrade.count()).toBe(1)
  })

  it("allows the owner to remove an entry", async () => {
    const owner = await createUser({ ign: "brock" })
    const entry = await prisma.wantedTrade.create({
      data: {
        ownerId: owner.id,
        dexNumber: 25,
        pokemonName: "Pikachu",
      },
    })

    authenticate(owner)
    const { req, res } = createMocks({
      method: "DELETE",
      query: { id: String(entry.id) },
    })

    await entryHandler(req, res)

    expect(res._getStatusCode()).toBe(200)
    expect(await prisma.wantedTrade.count()).toBe(0)
  })
})
