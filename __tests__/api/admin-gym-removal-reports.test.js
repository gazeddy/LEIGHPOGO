/**
 * Integration tests for /api/admin/gyms/removal-reports.
 */

const { createMocks } = require("node-mocks-http");
const { getServerSession } = require("next-auth/next");

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("../../pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

jest.mock("../../lib/gyms", () => ({
  readGymState: jest.fn(),
  writeGymState: jest.fn(),
}));

const { readGymState, writeGymState } = require("../../lib/gyms");
const handler = require("../../pages/api/admin/gyms/removal-reports").default;

const gym = {
  id: "gym-1",
  name: "Test Gym",
  alias: null,
  url: null,
  lat: 53.49,
  lon: -2.52,
  exRaidEligible: false,
  firstSeenAt: null,
};

const report = {
  id: "report-1",
  gymId: gym.id,
  gymName: gym.name,
  reportedById: "12",
  reportedByIgn: "MemberIGN",
  reportedAt: "2026-07-31T10:00:00.000Z",
  status: "pending",
  reviewedAt: null,
  reviewedById: null,
  reviewedByIgn: null,
};

const state = {
  version: 1,
  importedAt: null,
  sourceFile: null,
  gyms: [gym],
  removalReports: [report],
};

beforeEach(() => {
  jest.clearAllMocks();
  getServerSession.mockResolvedValue({
    user: { id: 1, ign: "AdminIGN", role: "admin" },
  });
  readGymState.mockResolvedValue(state);
  writeGymState.mockResolvedValue(undefined);
});

describe("/api/admin/gyms/removal-reports", () => {
  it("rejects non-admin users", async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 12, ign: "MemberIGN", role: "user" },
    });
    const { req, res } = createMocks({ method: "GET" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(writeGymState).not.toHaveBeenCalled();
  });

  it("returns pending reports", async () => {
    const { req, res } = createMocks({ method: "GET" });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).reports).toEqual([report]);
  });

  it("approves a report and removes the gym atomically", async () => {
    const { req, res } = createMocks({
      method: "PATCH",
      body: { reportId: report.id, decision: "approve" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(writeGymState).toHaveBeenCalledWith(
      expect.objectContaining({
        gyms: [],
        removalReports: [
          expect.objectContaining({
            id: report.id,
            status: "approved",
            reviewedById: "1",
            reviewedByIgn: "AdminIGN",
            reviewedAt: expect.any(String),
          }),
        ],
      }),
    );
    expect(JSON.parse(res._getData()).gymRemoved).toBe(true);
  });

  it("rejects a report without removing the gym", async () => {
    const { req, res } = createMocks({
      method: "PATCH",
      body: { reportId: report.id, decision: "reject" },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(writeGymState).toHaveBeenCalledWith(
      expect.objectContaining({
        gyms: [gym],
        removalReports: [
          expect.objectContaining({
            id: report.id,
            status: "rejected",
          }),
        ],
      }),
    );
    expect(JSON.parse(res._getData()).gymRemoved).toBe(false);
  });
});
