const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("ticker regression wiring", () => {
  const eventTicker = readSource("components/events/EventTicker.tsx");
  const raidTicker = readSource("components/events/RaidBossTicker.tsx");

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

  it("retains matching pointer, hover and keyboard pause controls", () => {
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
