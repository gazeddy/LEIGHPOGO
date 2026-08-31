const fs = require("fs");
const path = require("path");

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("ticker regression wiring", () => {
  const app = readSource("pages/_app.js");
  const tickerStack = readSource("components/tickers/TickerStack.js");
  const tickerPreferences = readSource("lib/tickerPreferences.js");
  const tickerPreferencesApi = readSource("pages/api/ticker-preferences.js");
  const account = readSource("pages/account.js");
  const prismaSchema = readSource("prisma/schema.prisma");
  const eventsLib = readSource("lib/events.ts");
  const eventCard = readSource("components/events/EventCard.tsx");
  const eventTicker = readSource("components/events/EventTicker.tsx");
  const raidTicker = readSource("components/events/RaidBossTicker.tsx");
  const eventSelection = readSource("lib/event-selection.ts");
  const raidApi = readSource("pages/api/events/raids.ts");
  const raidHistory = readSource("lib/raid-boss-history.ts");
  const raidDetails = readSource("lib/raid-detail-source.ts");
  const raidCpCache = readSource("lib/raidBossCpCache.js");
  const dittoTicker = readSource("components/events/DittoDisguiseTicker.tsx");
  const dittoApi = readSource("pages/api/ditto-disguises.ts");
  const newGymTicker = readSource("components/gyms/NewGymTicker.tsx");
  const scrollableTicker = readSource("components/tickers/useScrollableTicker.ts");

  it("always opens event ticker items on the matching Events-page card", () => {
    expect(eventTicker).toContain('pathname: "/events"');
    expect(eventTicker).toContain("query: { event: item.eventID }");
    expect(eventTicker).not.toContain("href={item.eventUrl}");
    expect(eventTicker).not.toContain("target=\"_blank\"");
    expect(eventTicker).toContain("{item.guideSlug && item.guideTitle && (");
  });

  it("keeps event information native while preserving an optional Campfire meetup action", () => {
    expect(eventCard).not.toContain("View on LeekDuck");
    expect(eventCard).not.toContain("href={leekDuckUrl}");
    expect(eventCard).toContain("const campfireUrl = event.campfireUrl?.trim() || null;");
    expect(eventCard).toContain("href={campfireUrl}");
    expect(eventCard).toContain("View meetup on Campfire");
    expect(eventCard).toContain("Wild spawns");
    expect(eventCard).toContain("Event boosts");
    expect(eventsLib).toContain("/events?event=${encodeURIComponent(event.eventID)}");
    expect(eventSelection).toContain("const link = getEventDestination(event);");
    expect(eventSelection).toContain("link,");
  });

  it("keeps the raid ticker on a duplicated manually scrollable loop", () => {
    expect(raidTicker).toContain("<RaidItems items={items} />");
    expect(
      (raidTicker.match(/<RaidItems items=\{items\} duplicate \/>/g) || []).length,
    ).toBe(2);
    expect(raidTicker).toContain("aria-hidden={duplicate || undefined}");
    expect(raidTicker).toContain("tabIndex={duplicate ? -1 : undefined}");
    expect(raidTicker).toContain('className="raid-track"');
    expect(raidTicker).toContain("...viewportHandlers");
    expect(raidTicker).toContain("animation:none;");
    expect(raidTicker).toContain("transform:none;");
    expect(raidTicker).toContain("raid-group-duplicate");
  });

  it("shows perfect catch CP values from persisted active PoGoAPI raid data", () => {
    expect(raidApi).toContain("getRaidToolsData");
    expect(raidApi).toContain("data.tickerItems");
    expect(raidHistory).toContain("getCurrentRaidBossProfiles");
    expect(raidHistory).toContain("profileCatchCp");
    expect(raidDetails).toContain("getRaidBossCpData");
    expect(raidTicker).toContain("formatCatchCp(item.catchCp)");
    expect(raidTicker).toContain("100% CP");
    expect(raidTicker).toContain("WB");
    expect(raidTicker).toContain("unboosted level 20");
    expect(raidTicker).toContain("weather-boosted level 25");
  });

  it("keeps next raid bosses announcement-only until their start time", () => {
    expect(eventSelection).toContain(
      "RAID_NEXT_NOTICE_WINDOW_MS = 24 * 60 * 60 * 1000",
    );
    expect(raidHistory).toContain('state: "next" as const');
    expect(raidHistory).toContain("catchCp: undefined");
    expect(raidHistory).toContain("/tools/raids#");
    expect(raidTicker).toContain('const isNext = item.state === "next"');
    expect(raidTicker).toContain("isNext ? null : formatCatchCp(item.catchCp)");
    expect(raidTicker).toContain("from ${formatDate(item.start, true)}");
  });

  it("shows an accessible sparkle for PoGoAPI shiny-capable active raid bosses", () => {
    expect(raidCpCache).toContain("value.possible_shiny === true");
    expect(raidCpCache).toContain("possibleShiny: boss.possibleShiny");
    expect(raidTicker).toContain("entry.possibleShiny");
    expect(raidTicker).toContain('className="raid-shiny-sparkle"');
    expect(raidTicker).toContain("✨");
    expect(raidTicker).toContain('aria-label="Shiny available"');
    expect(raidTicker).toContain('title="Shiny available"');
  });

  it("keeps the Ditto ticker public, daily cached and between raids and new gyms", () => {
    expect(dittoTicker).toContain('fetch("/api/ditto-disguises"');
    expect(dittoTicker).not.toContain("useSession");
    expect(dittoTicker).not.toContain('cache: "no-store"');
    expect(dittoTicker).toContain("const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;");
    expect(dittoApi).toContain("max-age=86400");
    expect(dittoApi).toContain("s-maxage=86400");
    expect(dittoTicker).toContain("<DittoItems disguises={disguises} />");
    expect(
      (dittoTicker.match(/<DittoItems disguises=\{disguises\} duplicate \/>/g) || []).length,
    ).toBe(6);

    const raidPosition = tickerStack.indexOf("<RaidBossTicker />");
    const dittoPosition = tickerStack.indexOf("<DittoDisguiseTicker />");
    const gymPosition = tickerStack.indexOf("<NewGymTicker />");

    expect(raidPosition).toBeGreaterThan(-1);
    expect(dittoPosition).toBeGreaterThan(raidPosition);
    expect(gymPosition).toBeGreaterThan(dittoPosition);
  });

  it("lets logged-in users control each ticker and hides matching tickers on their own pages", () => {
    expect(app).toContain("<TickerStack />");
    expect(account).toContain("<TickerPreferenceSettings />");
    expect(tickerPreferences).toContain('EVENTS: "EVENTS"');
    expect(tickerPreferences).toContain('RAID_BOSS: "RAID_BOSS"');
    expect(tickerPreferences).toContain('DITTO: "DITTO"');
    expect(tickerPreferences).toContain('NEW_GYMS: "NEW_GYMS"');
    expect(tickerPreferences).toContain('pathname.startsWith("/events")');
    expect(tickerPreferences).toContain('pathname.startsWith("/tools/raids")');
    expect(tickerPreferences).toContain('pathname.startsWith("/gyms")');
    expect(tickerStack).toContain("preferences[TICKER_TYPES.EVENTS]");
    expect(tickerStack).toContain("preferences[TICKER_TYPES.RAID_BOSS]");
    expect(tickerStack).toContain("preferences[TICKER_TYPES.DITTO]");
    expect(tickerStack).toContain("preferences[TICKER_TYPES.NEW_GYMS]");
    expect(tickerStack).toContain("hiddenTickers.has(TICKER_TYPES.EVENTS)");
    expect(tickerStack).toContain("hiddenTickers.has(TICKER_TYPES.RAID_BOSS)");
    expect(tickerStack).toContain("hiddenTickers.has(TICKER_TYPES.NEW_GYMS)");
  });

  it("persists per-user ticker settings while missing preferences remain enabled", () => {
    expect(prismaSchema).toContain("tickerPreferences           UserTickerPreference[]");
    expect(prismaSchema).toContain("model UserTickerPreference");
    expect(prismaSchema).toContain("@@unique([ownerId, tickerType])");
    expect(tickerPreferences).toContain("DEFAULT_TICKER_PREFERENCES");
    expect(tickerPreferencesApi).toContain("prisma.userTickerPreference.findMany");
    expect(tickerPreferencesApi).toContain("prisma.userTickerPreference.upsert");
    expect(tickerPreferencesApi).toContain("normalizeTickerPreferences(rows)");
  });

  it("shares matching automatic speed and manual interaction behaviour", () => {
    expect(eventTicker).toContain("Math.max(32, items.length * 10)");
    expect(raidTicker).toContain("Math.max(32, items.length * 10)");

    for (const source of [eventTicker, raidTicker, dittoTicker, newGymTicker]) {
      expect(source).toContain("useScrollableTicker");
      expect(source).toContain("...viewportHandlers");
    }

    for (const handler of [
      "onPointerDown: handlePointerDown",
      "onPointerMove: handlePointerMove",
      "onPointerUp: finishPointerInteraction",
      "onPointerCancel: finishPointerInteraction",
      "onClickCapture: handleClickCapture",
      "onFocusCapture: handleFocus",
      "onBlurCapture: handleBlur",
      "onWheel: handleWheel",
    ]) {
      expect(scrollableTicker).toContain(handler);
    }

    expect(scrollableTicker).toContain("const AUTO_RESUME_DELAY_MS = 3000;");
    expect(scrollableTicker).toContain("const DRAG_THRESHOLD_PX = 5;");
    expect(scrollableTicker).toContain("virtualScrollLeftRef.current +=");
    expect(scrollableTicker).toContain(
      "viewport.scrollLeft = virtualScrollLeftRef.current",
    );
    expect(scrollableTicker).toContain("normaliseScrollPosition");
    expect(scrollableTicker).toContain("scrollableRef.current");
    expect(scrollableTicker).toContain("scheduleResume");
  });
});
