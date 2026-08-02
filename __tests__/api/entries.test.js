/**
 * Integration tests for /api/entries.
 * Run with: npm test
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:memdb1?mode=memory&cache=shared";

const fs = require("fs");
const path = require("path");
const { createMocks } = require("node-mocks-http");
const { getServerSession } = require("next-auth/next");

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

const prisma = require("../../lib/prisma");
const handler = require("../../pages/api/entries").default;

const ensureSchema = async () => {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await prisma.$executeRawUnsafe(`
    DROP TABLE IF EXISTS "Entry";
  `);

  await prisma.$executeRawUnsafe(`
    DROP TABLE IF EXISTS "User";
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "name" TEXT,
      "ign" TEXT NOT NULL UNIQUE,
      "password" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'user',
      "friendCode" TEXT,
      "team" TEXT NOT NULL DEFAULT 'MYSTIC'
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Entry" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "trainerName" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "team" TEXT NOT NULL DEFAULT 'MYSTIC',
      "ownerId" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Entry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
};

beforeAll(async () => {
  await ensureSchema();
});

beforeEach(async () => {
  await prisma.entry.deleteMany();
  await prisma.user.deleteMany();
  jest.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/entries", () => {
  it("returns 401 when no session is present", async () => {
    getServerSession.mockResolvedValueOnce(null);

    const { req, res } = createMocks({
      method: "POST",
      body: { trainerName: "Ash", friendCode: "1111-2222-3333" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: "You must be logged in." });
  });

  it("stores a valid friend code as three blocks of four digits", async () => {
    const user = await prisma.user.create({
      data: { ign: "misty", password: "hashed", role: "user" },
    });

    getServerSession.mockResolvedValueOnce({
      user: { id: user.id, ign: user.ign, role: user.role },
    });

    const { req, res } = createMocks({
      method: "POST",
      body: { trainerName: "Misty", friendCode: "4444-5555-6666" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const payload = JSON.parse(res._getData());
    expect(payload.trainerName).toBe("Misty");
    expect(payload.code).toBe("4444 5555 6666");
    expect(payload.ownerId).toBe(user.id);

    const entries = await prisma.entry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].trainerName).toBe("Misty");
    expect(entries[0].code).toBe("4444 5555 6666");
  });

  it("rejects malformed friend codes instead of storing them", async () => {
    const user = await prisma.user.create({
      data: { ign: "brock", password: "hashed", role: "user" },
    });

    getServerSession.mockResolvedValueOnce({
      user: { id: user.id, ign: user.ign, role: user.role },
    });

    const { req, res } = createMocks({
      method: "POST",
      body: { trainerName: "Brock", friendCode: "1234 5678" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("exactly 12 digits");
    expect(await prisma.entry.count()).toBe(0);
  });
});

describe("friend code migration", () => {
  it("repairs legacy separators and clears malformed rows", async () => {
    const user = await prisma.user.create({
      data: { ign: "legacy", password: "hashed", role: "user" },
    });

    await prisma.entry.createMany({
      data: [
        {
          trainerName: "DigitsOnly",
          code: "111122223333",
          ownerId: user.id,
        },
        {
          trainerName: "Hyphenated",
          code: "4444-5555-6666",
          ownerId: user.id,
        },
        {
          trainerName: "Malformed",
          code: "1234 5678",
          ownerId: user.id,
        },
      ],
    });

    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma/migrations/20260802123000_normalize_friend_codes/migration.sql",
      ),
      "utf8",
    );

    await prisma.$executeRawUnsafe(migration);

    const entries = await prisma.entry.findMany({
      orderBy: { trainerName: "asc" },
      select: { trainerName: true, code: true },
    });

    expect(entries).toEqual([
      { trainerName: "DigitsOnly", code: "1111 2222 3333" },
      { trainerName: "Hyphenated", code: "4444 5555 6666" },
      { trainerName: "Malformed", code: "" },
    ]);
  });
});
