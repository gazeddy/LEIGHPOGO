/**
 * Integration tests for /api/gyms/create.
 * Run with: npm test
 */

const { createMocks } = require("node-mocks-http");
const { getServerSession } = require("next-auth/next");

jest.mock("node:crypto", () => ({
  randomUUID: jest.fn(() => "test-gym-id"),
}));

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

jest.mock("../../lib/gyms", () => ({
  readGymState: jest.fn(),
  writeGymState: jest.fn(),
  sortGyms: jest.fn((gyms) => gyms),
}));

const {
  readGymState,
  writeGymState,
} = require("../../lib/gyms");
const handler = require("../../pages/api/gyms/create").default;

const emptyState = {
  version: 1,
  importedAt: null,
  sourceFile: null,
  gyms: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  readGymState.mockResolvedValue(emptyState);
  writeGymState.mockResolvedValue(undefined);
});

describe("POST /api/gyms/create", () => {
  it("rejects logged-out requests", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const { req, res } = createMocks({
      method: "POST",
      body: { title: "Test Gym", lat: 53.49, lon: -2.52 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({
      error: "Authentication required",
    });
    expect(writeGymState).not.toHaveBeenCalled();
  });

  it("creates a gym from valid coordinates", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 1, ign: "gaz", role: "user" },
    });
    const { req, res } = createMocks({
      method: "POST",
      body: {
        title: "  Leigh   Cenotaph  ",
        lat: "53.496",
        lon: "-2.519",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const payload = JSON.parse(res._getData());
    expect(payload.message).toBe("Gym added successfully.");
    expect(payload.gym).toEqual(
      expect.objectContaining({
        id: "community-test-gym-id",
        name: "Leigh Cenotaph",
        lat: 53.496,
        lon: -2.519,
        alias: null,
        url: null,
        exRaidEligible: false,
        firstSeenAt: expect.any(String),
      }),
    );
    expect(writeGymState).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        gyms: [expect.objectContaining({ id: "community-test-gym-id" })],
      }),
    );
  });

  it("rejects coordinates outside the valid range", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 1, ign: "gaz", role: "user" },
    });
    const { req, res } = createMocks({
      method: "POST",
      body: { title: "Test Gym", lat: 91, lon: -2.52 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: "The latitude is invalid.",
    });
    expect(writeGymState).not.toHaveBeenCalled();
  });

  it("rejects a blank gym title", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 1, ign: "gaz", role: "user" },
    });
    const { req, res } = createMocks({
      method: "POST",
      body: { title: "   ", lat: 53.49, lon: -2.52 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: "Enter a title for the gym.",
    });
    expect(writeGymState).not.toHaveBeenCalled();
  });
});
