import { buildNewGymPushPayload } from "../../lib/new-gym-push";
import type { GymRecord } from "../../lib/gyms";

function gym(id: string, name: string, alias: string | null = null): GymRecord {
  return {
    id,
    name,
    alias,
    markerEmoji: null,
    url: null,
    lat: 53.49,
    lon: -2.52,
    exRaidEligible: false,
    firstSeenAt: "2026-08-31T10:00:00.000Z",
  };
}

describe("new gym push payload", () => {
  it("builds a singular notification using the display name", () => {
    expect(buildNewGymPushPayload([gym("gym-1", "Leigh Sports Village", "The Leopards")])).toEqual({
      title: "New gym: The Leopards",
      body: "A new gym has been added to the community map.",
      tag: "new-gym-gym-1",
      renotify: false,
      url: "/gyms",
    });
  });

  it("batches multiple imported gyms into one notification", () => {
    const payload = buildNewGymPushPayload([
      gym("gym-1", "Gym One"),
      gym("gym-2", "Gym Two"),
      gym("gym-3", "Gym Three"),
      gym("gym-4", "Gym Four"),
    ]);

    expect(payload?.title).toBe("4 new gyms added");
    expect(payload?.body).toBe("Gym One, Gym Two, Gym Three +1 more");
    expect(payload?.url).toBe("/gyms");
  });

  it("deduplicates gyms by id", () => {
    const payload = buildNewGymPushPayload([
      gym("gym-1", "Gym One"),
      gym("gym-1", "Gym One"),
    ]);

    expect(payload?.title).toBe("New gym: Gym One");
  });
});
