import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { EventTickerItem } from "../../lib/events";

interface TickerPayload {
  items?: EventTickerItem[];
}

type TickerStatus = "loading" | "ready" | "error";

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
  items: EventTickerItem[];
  duplicate?: boolean;
}) {
  return (
    <div
      className={`ticker-group${duplicate ? " ticker-group-duplicate" : ""}`}
      aria-hidden={duplicate || undefined}
    >
      {items.map((item) => {
        const key = `${duplicate ? "duplicate-" : ""}${item.eventID}`;

        return (
          <span key={key} className="ticker-item">
            <span className="ticker-heading">{item.heading}</span>
            <span className="ticker-name">{item.name}</span>
            <time dateTime={item.start}>{formatTickerDate(item.start)}</time>

            {item.eventUrl && item.eventUrlLabel && (
              <a
                href={item.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ticker-action ticker-meetup"
                tabIndex={duplicate ? -1 : undefined}
              >
                {item.eventUrlLabel} ↗
              </a>
            )}

            {item.guideSlug && item.guideTitle && (
              <Link
                href={`/guides/${item.guideSlug}`}
                className="ticker-action ticker-guide"
                tabIndex={duplicate ? -1 : undefined}
                title={`Read ${item.guideTitle}`}
              >
                Guide →
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function EventTicker() {
  const [items, setItems] = useState<EventTickerItem[]>([]);
  const [status, setStatus] = useState<TickerStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function loadTicker() {
      try {
        const response = await fetch("/api/events/ticker", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          setStatus("error");
          return;
        }

        const payload = (await response.json()) as TickerPayload;
        setItems(Array.isArray(payload.items) ? payload.items : []);
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to load event ticker", error);
          setStatus("error");
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

  const message =
    status === "loading"
      ? "Loading upcoming events…"
      : status === "error"
        ? "Event ticker temporarily unavailable"
        : "No upcoming events currently listed";

  return (
    <section className="event-ticker" aria-label="Upcoming events">
      <div className="ticker-label">
        <span aria-hidden="true">●</span>
        Upcoming
      </div>

      <div className="ticker-viewport">
        {items.length > 0 ? (
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
        ) : (
          <p className="ticker-message" role="status">
            {message}
          </p>
        )}
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

        .ticker-message {
          margin: 0;
          padding: 0 18px;
          color: #8b949e;
          font-size: 0.84rem;
          line-height: 42px;
          white-space: nowrap;
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
          white-space: nowrap;
        }

        .ticker-item::after {
          content: "◆";
          margin-left: 10px;
          color: #484f58;
          font-size: 0.55rem;
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

        .ticker-action {
          border-radius: 4px;
          padding: 0 4px;
          font-weight: 800;
          line-height: 26px;
          text-decoration: none;
        }

        .ticker-action:hover,
        .ticker-action:focus-visible {
          background: #1f2937;
          outline: none;
          text-decoration: underline;
        }

        .ticker-meetup {
          color: #79c0ff;
        }

        .ticker-guide {
          color: #3fb950;
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
