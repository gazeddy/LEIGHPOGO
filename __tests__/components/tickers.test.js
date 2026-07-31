const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("ticker regression wiring", () => {
  const app = readSource("pages/_app.js");
  const eventTicker = readSource("components/events/EventTicker.tsx");
  const raidTicker = readSource("components/events/RaidBossTicker.tsx");
  const dittoTicker = readSource("components/events/DittoDisguiseTicker.tsx");

  it("uses a Campfire URL as the primary event link with an Events-page fallback", () => {
    expect(eventTicker).toMatch(
      /item\.eventUrl \? \([\s\S]*?<a[\s\S]*?href=\{item\.eventUrl\}[\s\S]*?target="_blank"[\s\S]*?>[\s\S]*?\{primaryContent\}[\s\S]*?<\/a>[\s\S]*?\) : \([\s\S]*?<Link[\s\S]*?pathname: "\/events"[\s\S]*?event: item\.eventID/,
    );
    expect(eventTicker).toContain("{item.eventUrl && item.eventUrlLabel && (");
    expect(eventTicker).toContain("{item.eventUrlLabel} ↗");
    expect(eventTicker).toContain("{item.guideSlug && item.guideTitle && (");
  });

  it("keeps the raid ticker on a duplicated continuous scrolling track", () => {
    expect(raidTicker).toContain("<RaidItems items={items} />");
    expect(raidTicker).toContain("<RaidItems items={items} duplicate />");
    expect(raidTicker).toContain("aria-hidden={duplicate || undefined}");
    expect(raidTicker).toContain("tabIndex={duplicate ? -1 : undefined}");
    expect(raidTicker).toContain("animation: raid-ticker-scroll var(--raid-ticker-duration) linear infinite;");
    expect(raidTicker).toContain("transform: translateX(-50%);");
    expect(raidTicker).toContain("animation-play-state: paused;");
    expect(raidTicker).toContain(".raid-group-duplicate");
    expect(raidTicker).toContain("display: none;");
  });

  it("keeps the Ditto ticker public and between raids and new gyms", () => {
    expect(dittoTicker).toContain('fetch("/api/ditto-disguises"');
    expect(dittoTicker).not.toContain("useSession");
    expect(dittoTicker).toContain("<DittoItems disguises={disguises} />");
    expect(dittoTicker).toContain("<DittoItems disguises={disguises} duplicate />");

    const raidPosition = app.indexOf("<RaidBossTicker />");
    const dittoPosition = app.indexOf("<DittoDisguiseTicker />");
    const gymPosition = app.indexOf("<NewGymTicker />");

    expect(raidPosition).toBeGreaterThan(-1);
    expect(dittoPosition).toBeGreaterThan(raidPosition);
    expect(gymPosition).toBeGreaterThan(dittoPosition);
  });

  it("retains matching speed and interaction behaviour", () => {
    expect(eventTicker).toContain("Math.max(32, items.length * 10)");
    expect(raidTicker).toContain("Math.max(32, items.length * 10)");

    for (const handler of [
      "onPointerDown={handlePointerDown}",
      "onPointerUp={handlePointerUp}",
      "onPointerCancel={handlePointerCancel}",
      "onPointerEnter={handlePointerEnter}",
      "onPointerLeave={handlePointerLeave}",
      "onFocusCapture={handleFocus}",
      "onBlurCapture={handleBlur}",
    ]) {
      expect(eventTicker).toContain(handler);
      expect(raidTicker).toContain(handler);
    }

    expect(eventTicker).toContain("const AUTO_RESUME_DELAY_MS = 3000;");
    expect(raidTicker).toContain("const AUTO_RESUME_DELAY_MS = 3000;");
    expect(eventTicker).toContain("const TAP_MAX_DURATION_MS = 450;");
    expect(raidTicker).toContain("const TAP_MAX_DURATION_MS = 450;");
  });
});
