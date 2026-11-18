import {
  absoluteUrl,
  cleanCanonicalPath,
  eventJsonLd,
  isIndexablePath,
} from "../../lib/seo";

describe("SEO helpers", () => {
  it("removes query strings from canonical paths", () => {
    expect(cleanCanonicalPath("/events?event=raid-hour", "/events")).toBe(
      "/events",
    );
    expect(cleanCanonicalPath("/events/raid-hour?ref=ticker", "/events/[eventID]")).toBe(
      "/events/raid-hour",
    );
  });

  it("only indexes the intentionally public search landing pages", () => {
    expect(isIndexablePath("/")).toBe(true);
    expect(isIndexablePath("/events")).toBe(true);
    expect(isIndexablePath("/events/raid-hour")).toBe(true);
    expect(isIndexablePath("/friend-codes")).toBe(true);
    expect(isIndexablePath("/gyms")).toBe(false);
    expect(isIndexablePath("/admin")).toBe(false);
  });

  it("builds production absolute URLs", () => {
    expect(absoluteUrl("/events/raid-hour")).toBe(
      "https://leighpogo.co.uk/events/raid-hour",
    );
  });

  it("only emits Event structured data when there is a Leigh community meetup", () => {
    const baseEvent = {
      eventID: "raid-hour",
      name: "Raid Hour",
      eventType: "raid-hour",
      heading: "Raid Hour",
      link: null,
      image: null,
      start: "2026-09-02T18:00:00+01:00",
      end: "2026-09-02T19:00:00+01:00",
    };

    expect(eventJsonLd(baseEvent)).toBeNull();
    expect(
      eventJsonLd({
        ...baseEvent,
        campfireUrl: "https://campfire.nianticlabs.com/",
      }),
    ).toMatchObject({
      "@type": "Event",
      url: "https://leighpogo.co.uk/events/raid-hour",
    });
  });
});
