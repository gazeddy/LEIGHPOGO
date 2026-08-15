import { useEffect, useMemo, useState } from "react";
import type { RaidBossCatchCp, RaidBossTickerItem } from "../../lib/events";
import {
  EVENT_VISIBILITY_CHANGED_EVENT,
  EVENT_VISIBILITY_POLL_INTERVAL_MS,
} from "../../lib/event-visibility-client";
import { useScrollableTicker } from "../tickers/useScrollableTicker";

interface RaidTickerPayload {
  items?: RaidBossTickerItem[];
}

type RaidTickerStatus = "loading" | "ready" | "error";

function dateForDisplay(value: string): { date: Date; timeZone: string } {
  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  return {
    date: new Date(includesTimeZone ? value : `${value}Z`),
    timeZone: includesTimeZone ? "Europe/London" : "UTC",
  };
}

function formatDate(value: string, includeTime = false): string {
  const { date, timeZone } = dateForDisplay(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatCp(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatCatchCp(catchCp: RaidBossCatchCp[] | undefined): string | null {
  if (!catchCp || catchCp.length === 0) return null;
  if (catchCp.length === 1) {
    return `100% CP ${formatCp(catchCp[0].maxUnboostedCp)} · WB ${formatCp(catchCp[0].maxBoostedCp)}`;
  }
  return `100% CP ${catchCp
    .map((entry) => `${entry.boss} ${formatCp(entry.maxUnboostedCp)} / WB ${formatCp(entry.maxBoostedCp)}`)
    .join(" · ")}`;
}

function shinyBossNames(catchCp: RaidBossCatchCp[] | undefined): string[] {
  if (!catchCp) return [];
  return Array.from(new Set(catchCp.filter((entry) => entry.possibleShiny).map((entry) => entry.boss)));
}

function RaidItem({ item, duplicate = false }: { item: RaidBossTickerItem; duplicate?: boolean }) {
  const isNext = item.state === "next";
  const catchCp = isNext ? null : formatCatchCp(item.catchCp);
  const shinyBosses = isNext ? [] : shinyBossNames(item.catchCp);
  const content = (
    <>
      <span className={`raid-category raid-category-${item.category}${isNext ? " raid-category-next" : ""}`}>
        {isNext ? `Next ${item.label}` : item.label}
      </span>
      <span className="raid-boss">{item.boss}</span>
      {shinyBosses.length > 0 && (
        <span className="raid-shiny-sparkle" aria-label="Shiny available" title="Shiny available">✨</span>
      )}
      {catchCp && (
        <span className="raid-cp" title="Perfect-IV catch CP: unboosted level 20 and weather-boosted level 25">
          {catchCp}
        </span>
      )}
      <span className="raid-until">
        {isNext ? `from ${formatDate(item.start, true)}` : `until ${formatDate(item.end)}`}
      </span>
    </>
  );

  if (!item.link) return <span className="raid-item">{content}</span>;
  const external = /^https?:\/\//i.test(item.link);
  return (
    <a
      href={item.link}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="raid-item raid-item-link"
      tabIndex={duplicate ? -1 : undefined}
      title={isNext ? `Open ${item.label} raid section` : `View ${item.boss} raid information`}
    >
      {content}
      <span aria-hidden="true">→</span>
    </a>
  );
}

function RaidItems({ items, duplicate = false }: { items: RaidBossTickerItem[]; duplicate?: boolean }) {
  return (
    <div className={`raid-group${duplicate ? " raid-group-duplicate" : ""}`} aria-hidden={duplicate || undefined}>
      {items.map((item) => (
        <RaidItem key={`${duplicate ? "duplicate-" : ""}${item.state ?? "current"}-${item.eventID}`} item={item} duplicate={duplicate} />
      ))}
    </div>
  );
}

export default function RaidBossTicker() {
  const [items, setItems] = useState<RaidBossTickerItem[]>([]);
  const [status, setStatus] = useState<RaidTickerStatus>("loading");

  useEffect(() => {
    let controller: AbortController | null = null;
    async function loadRaidBosses() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/events/raids", {
          signal: controller.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const payload = (await response.json()) as RaidTickerPayload;
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to load current raid bosses", error);
          setStatus("error");
        }
      }
    }

    const reload = () => void loadRaidBosses();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") reload();
    };
    reload();
    const pollTimer = window.setInterval(reload, EVENT_VISIBILITY_POLL_INTERVAL_MS);
    window.addEventListener(EVENT_VISIBILITY_CHANGED_EVENT, reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller?.abort();
      window.clearInterval(pollTimer);
      window.removeEventListener(EVENT_VISIBILITY_CHANGED_EVENT, reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const animationDurationSeconds = useMemo(() => Math.max(32, items.length * 10), [items.length]);
  const { viewportRef, paused, dragging, viewportHandlers } = useScrollableTicker({
    durationSeconds: animationDurationSeconds,
    contentKey: items.map((item) => `${item.state}-${item.eventID}`).join("|"),
    enabled: items.length > 0,
  });

  const message = status === "loading"
    ? "Loading current raid bosses…"
    : status === "error"
      ? "Current raid bosses temporarily unavailable"
      : "No current raid bosses listed";

  return (
    <section className={`raid-ticker${paused ? " paused" : ""}${dragging ? " dragging" : ""}`} aria-label="Raid bosses">
      <div className="raid-label"><span aria-hidden="true">●</span>Raids</div>
      <div ref={viewportRef} className="raid-viewport" {...viewportHandlers}>
        {items.length > 0 ? (
          <div className="raid-track">
            <RaidItems items={items} duplicate />
            <RaidItems items={items} />
            <RaidItems items={items} duplicate />
          </div>
        ) : (
          <p className="raid-message" role="status">{message}</p>
        )}
      </div>

      <style jsx>{`
        .raid-ticker { display:flex; min-height:38px; align-items:stretch; overflow:hidden; border-bottom:1px solid #30363d; background:#0f141b; color:#f0f6fc; }
        .raid-label { position:relative; z-index:2; display:flex; flex:0 0 auto; align-items:center; gap:7px; padding:0 15px; border-right:1px solid #30363d; background:#0d1117; color:#d2a8ff; font-size:.74rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
        .raid-label span { color:#f85149; font-size:.65rem; }
        .raid-viewport { min-width:0; flex:1; overflow-x:auto; overflow-y:hidden; cursor:grab; overscroll-behavior-x:contain; scrollbar-width:none; touch-action:pan-y; -ms-overflow-style:none; mask-image:linear-gradient(to right,transparent,black 18px,black calc(100% - 18px),transparent); }
        .raid-viewport::-webkit-scrollbar { display:none; }
        .raid-ticker.dragging .raid-viewport { cursor:grabbing; }
        .raid-track { display:flex; width:max-content; min-width:100%; animation:none; transform:none; }
        .raid-message { margin:0; padding:0 18px; color:#8b949e; font-size:.82rem; line-height:38px; white-space:nowrap; }
        @media (max-width:620px) { .raid-label { padding:0 10px; font-size:.68rem; } }
        @media (prefers-reduced-motion:reduce) { .raid-viewport { mask-image:none; } }
      `}</style>

      <style jsx global>{`
        .raid-group { display:flex; flex:0 0 auto; align-items:stretch; }
        .raid-item { display:inline-flex; align-items:center; gap:7px; padding:0 16px; color:#c9d1d9; font-size:.82rem; line-height:38px; text-decoration:none; white-space:nowrap; }
        .raid-item::after { content:"◆"; margin-left:8px; color:#30363d; font-size:.5rem; }
        .raid-item-link:hover,.raid-item-link:focus-visible { color:#fff; background:#1f2937; outline:none; }
        .raid-category { font-size:.72rem; font-weight:900; letter-spacing:.03em; text-transform:uppercase; }
        .raid-category-five-star { color:#f2cc60; }
        .raid-category-shadow { color:#d2a8ff; }
        .raid-category-mega { color:#79c0ff; }
        .raid-category-next { color:#58a6ff; }
        .raid-boss { font-weight:800; }
        .raid-shiny-sparkle { display:inline-block; color:#f2cc60; filter:drop-shadow(0 0 4px rgba(242,204,96,.75)); font-size:.9em; line-height:1; }
        .raid-cp { color:#a5d6ff; font-size:.76rem; font-variant-numeric:tabular-nums; }
        .raid-until { color:#8b949e; font-size:.76rem; }
      `}</style>
    </section>
  );
}
