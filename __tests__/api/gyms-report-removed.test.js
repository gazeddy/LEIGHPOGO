/**
 * Integration tests for /api/gyms/report-removed.
 */

const { createMocks } = require("node-mocks-http");
const { getServerSession } = require("next-auth/next");

jest.mock("node:crypto", () => ({
  randomUUID: jest.fn(() => "removal-report-id"),
}));

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

jest.mock("../../lib/gyms", () => ({
  getGymDisplayName: jest.fn((gym) => gym.alias || gym.name),
  readGymState: jest.fn(),
  writeGymState: jest.fn(),
}));

const { readGymState, writeGymState } = require("../../lib/gyms");
const handler = require("../../pages/api/gyms/report-removed").default;

const gym = {
  id: "gym-1",
  name: "Official Gym Name",
  alias: "Community Name",
  url: null,
  lat: 53.49,
  lon: -2.52,
  exRaidEligible: false,
  firstSeenAt: null,
};

const state = {
  version: 1,
  importedAt: null,
  sourceFile: null,
  gyms: [gym],
  removalReports: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  readGymState.mockResolvedValue(state);
  writeGymState.mockResolvedValue(undefined);
});

describe("POST /api/gyms/report-removed", () => {
  it("rejects logged-out requests", async () => {
    getServerSession.mockResolvedValueOnce(null);
    const { req, res } = createMocks({
      method: "POST",
      body: { gymId: gym.id },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(writeGymState).not.toHaveBeenCalled();
  });

  it("creates a pending report for a logged-in member", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 12, ign: "MemberIGN", role: "user" },
    });
    const { req, res } = createMocks({
      method: "POST",
      body: { gymId: gym.id },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const payload = JSON.parse(res._getData());
    expect(payload.report).toEqual(
      expect.objectContaining({
        id: "removal-report-id",
        gymId: gym.id,
        gymName: "Community Name",
        reportedById: "12",
        reportedByIgn: "MemberIGN",
        status: "pending",
      }),
    );
    expect(writeGymState).toHaveBeenCalledWith(
      expect.objectContaining({
        gyms: [gym],
        removalReports: [
          expect.objectContaining({
            id: "removal-report-id",
            gymId: gym.id,
            status: "pending",
          }),
        ],
      }),
    );
  });

  it("does not create a duplicate pending report", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 12, ign: "MemberIGN", role: "user" },
    });
    readGymState.mockResolvedValueOnce({
      ...state,
      removalReports: [
        {
          id: "existing-report",
          gymId: gym.id,
          gymName: gym.name,
          reportedById: "7",
          reportedByIgn: "OtherMember",
          reportedAt: "2026-07-31T10:00:00.000Z",
          status: "pending",
          reviewedAt: null,
          reviewedById: null,
          reviewedByIgn: null,
        },
      ],
    });
    const { req, res } = createMocks({
      method: "POST",
      body: { gymId: gym.id },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).report.id).toBe("existing-report");
    expect(writeGymState).not.toHaveBeenCalled();
  });
});
