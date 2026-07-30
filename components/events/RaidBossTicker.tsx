import { useEffect, useState } from "react";
import type { RaidBossTickerItem } from "../../lib/events";
import {
  EVENT_VISIBILITY_CHANGED_EVENT,
  EVENT_VISIBILITY_POLL_INTERVAL_MS,
} from "../../lib/event-visibility-client";

interface RaidTickerPayload {
  items?: RaidBossTickerItem[];
}

type RaidTickerStatus = "loading" | "ready" | "error";

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

function formatEndDate(value: string): string {
  const { date, timeZone } = dateForDisplay(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function RaidItem({ item }: { item: RaidBossTickerItem }) {
  const content = (
    <>
      <span className={`raid-category raid-category-${item.category}`}>
        {item.label}
      </span>
      <span className="raid-boss">{item.boss}</span>
      <span className="raid-until">until {formatEndDate(item.end)}</span>
    </>
  );

  if (!item.link) {
    return <span className="raid-item">{content}</span>;
  }

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="raid-item raid-item-link"
      title={`View ${item.label} ${item.boss} raid details`}
    >
      {content}
      <span aria-hidden="true">↗</span>
    </a>
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

    const reload = () => {
      void loadRaidBosses();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reload();
      }
    };

    reload();
    const pollTimer = window.setInterval(
      reload,
      EVENT_VISIBILITY_POLL_INTERVAL_MS,
    );
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

  const message =
    status === "loading"
      ? "Loading current raid bosses…"
      : status === "error"
        ? "Current raid bosses temporarily unavailable"
        : "No current raid bosses listed";

  return (
    <section className="raid-ticker" aria-label="Current raid bosses">
      <div className="raid-label">
        <span aria-hidden="true">●</span>
        Current raids
      </div>

      <div className="raid-viewport">
        {items.length > 0 ? (
          <div className="raid-list">
            {items.map((item) => (
              <RaidItem key={item.eventID} item={item} />
            ))}
          </div>
        ) : (
          <p className="raid-message" role="status">
            {message}
          </p>
        )}
      </div>

      <style jsx>{`
        .raid-ticker {
          display: flex;
          min-height: 38px;
          align-items: stretch;
          overflow: hidden;
          border-bottom: 1px solid #30363d;
          background: #0f141b;
          color: #f0f6fc;
        }

        .raid-label {
          position: relative;
          z-index: 2;
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 7px;
          padding: 0 15px;
          border-right: 1px solid #30363d;
          background: #0d1117;
          color: #d2a8ff;
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .raid-label span {
          color: #f85149;
          font-size: 0.65rem;
        }

        .raid-viewport {
          min-width: 0;
          flex: 1;
          overflow-x: auto;
        }

        .raid-list {
          display: flex;
          width: max-content;
          min-width: 100%;
          align-items: stretch;
        }

        .raid-message {
          margin: 0;
          padding: 0 18px;
          color: #8b949e;
          font-size: 0.82rem;
          line-height: 38px;
          white-space: nowrap;
        }

        @media (max-width: 620px) {
          .raid-label {
            padding: 0 10px;
            font-size: 0.68rem;
          }
        }
      `}</style>

      <style jsx global>{`
        .raid-item {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 0 16px;
          color: #c9d1d9;
          font-size: 0.82rem;
          line-height: 38px;
          text-decoration: none;
          white-space: nowrap;
        }

        .raid-item::after {
          content: "◆";
          margin-left: 8px;
          color: #30363d;
          font-size: 0.5rem;
        }

        .raid-item-link:hover,
        .raid-item-link:focus-visible {
          color: #ffffff;
          background: #1f2937;
          outline: none;
        }

        .raid-category {
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .raid-category-five-star {
          color: #f2cc60;
        }

        .raid-category-shadow {
          color: #d2a8ff;
        }

        .raid-category-mega {
          color: #79c0ff;
        }

        .raid-boss {
          font-weight: 800;
        }

        .raid-until {
          color: #8b949e;
          font-size: 0.76rem;
        }
      `}</style>
    </section>
  );
}
