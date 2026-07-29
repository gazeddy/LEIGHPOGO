import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { GuidedEventTickerItem } from "../../lib/events";

interface TickerPayload {
  items?: GuidedEventTickerItem[];
}

function dateForDisplay(value: string): {
  date: Date;
  timeZone: string;
} {
  const includesTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

  return {
    date: new Date(includesTimeZone ? value : `${value}Z`),
    timeZone: includesTimeZone ? "Europe/London" : "UTC",
  };
}

function formatTickerDate(value: string): string {
  const { date, timeZone } = dateForDisplay(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function TickerItems({
  items,
  duplicate = false,
}: {
  items: GuidedEventTickerItem[];
  duplicate?: boolean;
}) {
  return (
    <div
      className={`ticker-group${duplicate ? " ticker-group-duplicate" : ""}`}
      aria-hidden={duplicate || undefined}
    >
      {items.map((item) => (
        <Link
          key={`${duplicate ? "duplicate-" : ""}${item.eventID}`}
          href={`/guides/${item.guideSlug}`}
          className="ticker-item"
          tabIndex={duplicate ? -1 : undefined}
          title={`Read ${item.guideTitle}`}
        >
          <span className="ticker-heading">{item.heading}</span>
          <span className="ticker-name">{item.name}</span>
          <time dateTime={item.start}>{formatTickerDate(item.start)}</time>
          <span className="ticker-guide">Read guide →</span>
        </Link>
      ))}
    </div>
  );
}

export default function EventTicker() {
  const [items, setItems] = useState<GuidedEventTickerItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTicker() {
      try {
        const response = await fetch("/api/events/ticker", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as TickerPayload;
        setItems(Array.isArray(payload.items) ? payload.items : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to load event ticker", error);
        }
      }
    }

    loadTicker();

    return () => controller.abort();
  }, []);

  const animationDuration = useMemo(
    () => `${Math.max(32, items.length * 10)}s`,
    [items.length],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="event-ticker" aria-label="Upcoming guided events">
      <div className="ticker-label">
        <span aria-hidden="true">●</span>
        Upcoming
      </div>

      <div className="ticker-viewport">
        <div
          className="ticker-track"
          style={
            {
              "--ticker-duration": animationDuration,
            } as CSSProperties
          }
        >
          <TickerItems items={items} />
          <TickerItems items={items} duplicate />
        </div>
      </div>

      <style jsx>{`
        .event-ticker {
          display: flex;
          min-height: 42px;
          align-items: stretch;
          overflow: hidden;
          border-bottom: 1px solid #30363d;
          background: #161b22;
          color: #f0f6fc;
        }

        .ticker-label {
          position: relative;
          z-index: 2;
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 7px;
          padding: 0 15px;
          border-right: 1px solid #30363d;
          background: #0d1117;
          color: #79c0ff;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ticker-label span {
          color: #3fb950;
          font-size: 0.65rem;
        }

        .ticker-viewport {
          min-width: 0;
          flex: 1;
          overflow: hidden;
          mask-image: linear-gradient(
            to right,
            transparent,
            black 18px,
            black calc(100% - 18px),
            transparent
          );
        }

        .ticker-track {
          display: flex;
          width: max-content;
          min-width: 100%;
          animation: ticker-scroll var(--ticker-duration) linear infinite;
          will-change: transform;
        }

        .event-ticker:hover .ticker-track,
        .event-ticker:focus-within .ticker-track {
          animation-play-state: paused;
        }

        @keyframes ticker-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (max-width: 620px) {
          .ticker-label {
            padding: 0 10px;
            font-size: 0.7rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ticker-viewport {
            overflow-x: auto;
            mask-image: none;
          }

          .ticker-track {
            animation: none;
          }
        }
      `}</style>

      <style jsx global>{`
        .ticker-group {
          display: flex;
          flex: 0 0 auto;
          align-items: stretch;
        }

        .ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 18px;
          color: #c9d1d9;
          font-size: 0.84rem;
          line-height: 42px;
          text-decoration: none;
          white-space: nowrap;
        }

        .ticker-item::after {
          content: "◆";
          margin-left: 10px;
          color: #484f58;
          font-size: 0.55rem;
        }

        .ticker-item:hover,
        .ticker-item:focus-visible {
          color: #ffffff;
          background: #1f2937;
          outline: none;
        }

        .ticker-heading {
          color: #79c0ff;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .ticker-name {
          font-weight: 700;
        }

        .ticker-item time {
          color: #8b949e;
        }

        .ticker-guide {
          color: #3fb950;
          font-weight: 700;
        }

        @media (prefers-reduced-motion: reduce) {
          .ticker-group-duplicate {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
