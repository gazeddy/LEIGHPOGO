import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
} from "react";
import type {
  RaidBossCatchCp,
  RaidBossTickerItem,
} from "../../lib/events";
import {
  EVENT_VISIBILITY_CHANGED_EVENT,
  EVENT_VISIBILITY_POLL_INTERVAL_MS,
} from "../../lib/event-visibility-client";

interface RaidTickerPayload {
  items?: RaidBossTickerItem[];
}

type RaidTickerStatus = "loading" | "ready" | "error";

const AUTO_RESUME_DELAY_MS = 3000;
const TAP_MAX_DURATION_MS = 450;

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

function formatCp(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatCatchCp(catchCp: RaidBossCatchCp[] | undefined): string | null {
  if (!catchCp || catchCp.length === 0) {
    return null;
  }

  if (catchCp.length === 1) {
    return `100% CP ${formatCp(catchCp[0].maxUnboostedCp)} · WB ${formatCp(
      catchCp[0].maxBoostedCp,
    )}`;
  }

  return `100% CP ${catchCp
    .map(
      (entry) =>
        `${entry.boss} ${formatCp(entry.maxUnboostedCp)} / WB ${formatCp(
          entry.maxBoostedCp,
        )}`,
    )
    .join(" · ")}`;
}

function shinyBossNames(catchCp: RaidBossCatchCp[] | undefined): string[] {
  if (!catchCp) {
    return [];
  }

  return Array.from(
    new Set(
      catchCp
        .filter((entry) => entry.possibleShiny)
        .map((entry) => entry.boss),
    ),
  );
}

function RaidItem({
  item,
  duplicate = false,
}: {
  item: RaidBossTickerItem;
  duplicate?: boolean;
}) {
  const catchCp = formatCatchCp(item.catchCp);
  const shinyBosses = shinyBossNames(item.catchCp);
  const shinyLabel =
    shinyBosses.length === 1
      ? `Shiny ${shinyBosses[0]} is available`
      : `Shiny available: ${shinyBosses.join(", ")}`;
  const content = (
    <>
      <span className={`raid-category raid-category-${item.category}`}>
        {item.label}
      </span>
      <span className="raid-boss">{item.boss}</span>
      {shinyBosses.length > 0 && (
        <span
          className="raid-shiny-sparkle"
          role="img"
          aria-label={shinyLabel}
          title={shinyLabel}
        >
          ✨
        </span>
      )}
      {catchCp && (
        <span
          className="raid-cp"
          title="Perfect-IV catch CP: unboosted level 20 and weather-boosted level 25"
        >
          {catchCp}
        </span>
      )}
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
      tabIndex={duplicate ? -1 : undefined}
      title={`View ${item.label} ${item.boss} raid details`}
    >
      {content}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function RaidItems({
  items,
  duplicate = false,
}: {
  items: RaidBossTickerItem[];
  duplicate?: boolean;
}) {
  return (
    <div
      className={`raid-group${duplicate ? " raid-group-duplicate" : ""}`}
      aria-hidden={duplicate || undefined}
    >
      {items.map((item) => (
        <RaidItem
          key={`${duplicate ? "duplicate-" : ""}${item.eventID}`}
          item={item}
          duplicate={duplicate}
        />
      ))}
    </div>
  );
}

export default function RaidBossTicker() {
  const [items, setItems] = useState<RaidBossTickerItem[]>([]);
  const [status, setStatus] = useState<RaidTickerStatus>("loading");
  const [paused, setPaused] = useState(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartedAtRef = useRef<number | null>(null);
  const pointerWasPausedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

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

  useEffect(
    () => () => {
      if (resumeTimerRef.current !== null) {
        clearTimeout(resumeTimerRef.current);
      }
    },
    [],
  );

  const animationDuration = useMemo(
    () => `${Math.max(32, items.length * 10)}s`,
    [items.length],
  );

  function clearResumeTimer() {
    if (resumeTimerRef.current !== null) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }

  function pauseTicker() {
    clearResumeTimer();
    setPaused(true);
  }

  function resumeTicker() {
    clearResumeTimer();
    setPaused(false);
  }

  function scheduleResume() {
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      setPaused(false);
    }, AUTO_RESUME_DELAY_MS);
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    clearResumeTimer();
    pointerStartedAtRef.current = performance.now();
    pointerWasPausedRef.current = paused;
    activePointerIdRef.current = event.pointerId;
    setPaused(true);
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    const startedAt = pointerStartedAtRef.current;
    const wasPaused = pointerWasPausedRef.current;
    const pressDuration =
      startedAt === null ? TAP_MAX_DURATION_MS + 1 : performance.now() - startedAt;
    const target = event.target as HTMLElement;
    const usedActionLink = target.closest("a") !== null;

    activePointerIdRef.current = null;
    pointerStartedAtRef.current = null;

    if (!usedActionLink && wasPaused && pressDuration <= TAP_MAX_DURATION_MS) {
      resumeTicker();
      return;
    }

    scheduleResume();
  }

  function handlePointerCancel(event: PointerEvent<HTMLElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    activePointerIdRef.current = null;
    pointerStartedAtRef.current = null;
    scheduleResume();
  }

  function handlePointerEnter(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse") {
      pauseTicker();
    }
  }

  function handlePointerLeave(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && activePointerIdRef.current === null) {
      scheduleResume();
    }
  }

  function handleFocus(event: FocusEvent<HTMLElement>) {
    const target = event.target as HTMLElement;

    if (target.matches(":focus-visible")) {
      pauseTicker();
    }
  }

  function handleBlur(event: FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget as Node | null;

    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      scheduleResume();
    }
  }

  const message =
    status === "loading"
      ? "Loading current raid bosses…"
      : status === "error"
        ? "Current raid bosses temporarily unavailable"
        : "No current raid bosses listed";

  return (
    <section
      className={`raid-ticker${paused ? " paused" : ""}`}
      aria-label="Current raid bosses"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
    >
      <div className="raid-label">
        <span aria-hidden="true">●</span>
        Current raids
      </div>

      <div className="raid-viewport">
        {items.length > 0 ? (
          <div
            className="raid-track"
            style={
              {
                "--raid-ticker-duration": animationDuration,
              } as CSSProperties
            }
          >
            <RaidItems items={items} />
            <RaidItems items={items} duplicate />
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
          overflow: hidden;
          mask-image: linear-gradient(
            to right,
            transparent,
            black 18px,
            black calc(100% - 18px),
            transparent
          );
        }

        .raid-track {
          display: flex;
          width: max-content;
          min-width: 100%;
          animation: raid-ticker-scroll var(--raid-ticker-duration) linear infinite;
          will-change: transform;
        }

        .raid-ticker.paused .raid-track {
          animation-play-state: paused;
        }

        .raid-message {
          margin: 0;
          padding: 0 18px;
          color: #8b949e;
          font-size: 0.82rem;
          line-height: 38px;
          white-space: nowrap;
        }

        @keyframes raid-ticker-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        @media (max-width: 620px) {
          .raid-label {
            padding: 0 10px;
            font-size: 0.68rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .raid-viewport {
            overflow-x: auto;
            mask-image: none;
          }

          .raid-track {
            animation: none;
          }
        }
      `}</style>

      <style jsx global>{`
        .raid-group {
          display: flex;
          flex: 0 0 auto;
          align-items: stretch;
        }

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

        .raid-shiny-sparkle {
          display: inline-block;
          color: #f2cc60;
          filter: drop-shadow(0 0 4px rgba(242, 204, 96, 0.75));
          font-size: 0.9em;
          line-height: 1;
          transform-origin: center;
          animation: raid-shiny-twinkle 1.8s ease-in-out infinite;
        }

        @keyframes raid-shiny-twinkle {
          0%,
          100% {
            opacity: 0.72;
            transform: scale(0.86) rotate(-8deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.18) rotate(8deg);
          }
        }

        .raid-cp {
          color: #a5d6ff;
          font-size: 0.76rem;
          font-variant-numeric: tabular-nums;
        }

        .raid-until {
          color: #8b949e;
          font-size: 0.76rem;
        }

        @media (prefers-reduced-motion: reduce) {
          .raid-group-duplicate {
            display: none;
          }

          .raid-shiny-sparkle {
            animation: none;
          }
        }
      `}</style>
    </section>
  );
}
