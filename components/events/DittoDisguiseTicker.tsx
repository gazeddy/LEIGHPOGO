import { useEffect, useMemo, useState } from "react";
import type {
  DittoDisguise,
  DittoDisguisePayload,
  DittoSeason,
} from "../../lib/ditto-disguises";
import { useScrollableTicker } from "../tickers/useScrollableTicker";

type DittoTickerStatus = "loading" | "ready" | "error";

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function DittoItems({
  disguises,
  duplicate = false,
}: {
  disguises: DittoDisguise[];
  duplicate?: boolean;
}) {
  return (
    <div
      className={`ditto-group${duplicate ? " ditto-group-duplicate" : ""}`}
      aria-hidden={duplicate || undefined}
    >
      {disguises.map((disguise) => (
        <span
          className="ditto-item"
          key={`${duplicate ? "duplicate-" : ""}${disguise.id}`}
        >
          <span className="ditto-ball" aria-hidden="true">◓</span>
          <strong>{disguise.name}</strong>
        </span>
      ))}
    </div>
  );
}

export default function DittoDisguiseTicker() {
  const [disguises, setDisguises] = useState<DittoDisguise[]>([]);
  const [season, setSeason] = useState<DittoSeason | null>(null);
  const [status, setStatus] = useState<DittoTickerStatus>("loading");

  useEffect(() => {
    let controller: AbortController | null = null;

    async function loadDisguises() {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch("/api/ditto-disguises", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          setStatus("error");
          return;
        }

        const payload = (await response.json()) as DittoDisguisePayload;
        setDisguises(
          Array.isArray(payload.disguises) ? payload.disguises : [],
        );
        setSeason(payload.season ?? null);
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("Failed to load current Ditto disguises", error);
          setStatus("error");
        }
      }
    }

    const refresh = () => void loadDisguises();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const animationDurationSeconds = useMemo(
    () => Math.max(32, disguises.length * 8),
    [disguises.length],
  );
  const { viewportRef, paused, dragging, viewportHandlers } =
    useScrollableTicker({
      durationSeconds: animationDurationSeconds,
      contentKey: disguises.length,
      enabled: disguises.length > 0,
    });
  const message =
    status === "loading"
      ? "Loading current Ditto disguises…"
      : status === "error"
        ? "Ditto disguises temporarily unavailable"
        : "No current Ditto disguises listed";

  return (
    <section
      className={`ditto-ticker${paused ? " paused" : ""}${dragging ? " dragging" : ""}`}
      aria-label={
        season
          ? `Current Ditto disguises during ${season.name}`
          : "Current Ditto disguises"
      }
      title={season ? `Pokémon GO season: ${season.name}` : undefined}
    >
      <div className="ditto-label">
        <span aria-hidden="true">◆</span>
        Ditto disguises
      </div>

      <div ref={viewportRef} className="ditto-viewport" {...viewportHandlers}>
        {disguises.length > 0 ? (
          <div className="ditto-track">
            <DittoItems disguises={disguises} duplicate />
            <DittoItems disguises={disguises} />
            <DittoItems disguises={disguises} duplicate />
          </div>
        ) : (
          <p className="ditto-message" role="status">
            {message}
          </p>
        )}
      </div>

      <style jsx>{`
        .ditto-ticker {
          display: flex;
          min-height: 38px;
          align-items: stretch;
          overflow: hidden;
          border-bottom: 1px solid #30363d;
          background: #15111d;
          color: #f0f6fc;
        }

        .ditto-label {
          position: relative;
          z-index: 2;
          display: flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 7px;
          padding: 0 15px;
          border-right: 1px solid #49365f;
          background: #100d16;
          color: #d2a8ff;
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .ditto-label span {
          color: #bc8cff;
          font-size: 0.62rem;
        }

        .ditto-viewport {
          min-width: 0;
          flex: 1;
          overflow-x: auto;
          overflow-y: hidden;
          cursor: grab;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
          touch-action: pan-y;
          -ms-overflow-style: none;
          mask-image: linear-gradient(
            to right,
            transparent,
            black 18px,
            black calc(100% - 18px),
            transparent
          );
        }

        .ditto-viewport::-webkit-scrollbar {
          display: none;
        }

        .ditto-ticker.dragging .ditto-viewport {
          cursor: grabbing;
        }

        .ditto-track {
          display: flex;
          width: max-content;
          min-width: 100%;
          animation: none;
          transform: none;
        }

        .ditto-message {
          margin: 0;
          padding: 0 18px;
          color: #8b949e;
          font-size: 0.82rem;
          line-height: 38px;
          white-space: nowrap;
        }

        @media (max-width: 620px) {
          .ditto-label {
            padding: 0 10px;
            font-size: 0.68rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ditto-viewport {
            mask-image: none;
          }
        }
      `}</style>

      <style jsx global>{`
        .ditto-group {
          display: flex;
          flex: 0 0 auto;
          align-items: stretch;
        }

        .ditto-item {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 0 16px;
          color: #d8c9e8;
          font-size: 0.82rem;
          line-height: 38px;
          white-space: nowrap;
        }

        .ditto-item::after {
          content: "◆";
          margin-left: 8px;
          color: #49365f;
          font-size: 0.5rem;
        }

        .ditto-ball {
          color: #bc8cff;
          font-size: 0.9rem;
        }

      `}</style>
    </section>
  );
}
