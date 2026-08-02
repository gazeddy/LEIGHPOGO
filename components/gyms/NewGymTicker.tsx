import Link from "next/link";
import { useSession } from "next-auth/react";
import { useScrollableTicker } from "../tickers/useScrollableTicker";
import { useEffect, useMemo, useState } from "react";

interface NewGymItem {
  id: string;
  name: string;
  alias: string | null;
  displayName: string;
  firstSeenAt: string | null;
}

interface NewGymPayload {
  gyms?: NewGymItem[];
}

type FetchState = "loading" | "ready" | "error";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function NewGymItems({
  gyms,
  duplicate = false,
}: {
  gyms: NewGymItem[];
  duplicate?: boolean;
}) {
  return (
    <div className="new-gym-copy" aria-hidden={duplicate || undefined}>
      {gyms.map((gym) => (
        <Link
          key={`${duplicate ? "duplicate-" : ""}${gym.id}`}
          href={`/gyms?gym=${encodeURIComponent(gym.id)}`}
          className="new-gym-item"
          tabIndex={duplicate ? -1 : undefined}
        >
          <strong>{gym.displayName}</strong>
          {gym.alias && <span className="official-name">({gym.name})</span>}
        </Link>
      ))}
    </div>
  );
}

export default function NewGymTicker() {
  const { status } = useSession();
  const [gyms, setGyms] = useState<NewGymItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");

  useEffect(() => {
    if (status !== "authenticated") {
      setGyms([]);
      setFetchState("loading");
      return;
    }

    let controller: AbortController | null = null;
    let hasLoaded = false;

    async function loadGyms() {
      controller?.abort();
      controller = new AbortController();

      if (!hasLoaded) {
        setFetchState("loading");
      }

      try {
        const response = await fetch("/api/gyms/new", {
          signal: controller.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          setGyms([]);
          setFetchState("error");
          hasLoaded = true;
          return;
        }

        const payload = (await response.json()) as NewGymPayload;
        setGyms(Array.isArray(payload.gyms) ? payload.gyms : []);
        setFetchState("ready");
        hasLoaded = true;
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setGyms([]);
          setFetchState("error");
          hasLoaded = true;
        }
      }
    }

    const refresh = () => void loadGyms();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [status]);

  const animationDurationSeconds = useMemo(
    () => Math.max(32, gyms.length * 10),
    [gyms.length],
  );
  const { viewportRef, paused, dragging, viewportHandlers } =
    useScrollableTicker({
      durationSeconds: animationDurationSeconds,
      contentKey: gyms.length,
      enabled: status === "authenticated" && gyms.length > 0,
    });

  if (status !== "authenticated") {
    return null;
  }

  const statusMessage =
    fetchState === "loading"
      ? "Checking for new gyms…"
      : fetchState === "error"
        ? "New gym updates are temporarily unavailable."
        : gyms.length === 0
          ? "No new gyms in the last 7 days."
          : null;

  return (
    <aside className={`new-gym-ticker${paused ? " paused" : ""}${dragging ? " dragging" : ""}`} aria-label="Newly added gyms">
      <Link href="/gyms" className="new-gym-label">
        <span aria-hidden="true">✨</span>
        <strong>New gyms</strong>
      </Link>
      <div ref={viewportRef} className="new-gym-viewport" aria-live="polite" {...viewportHandlers}>
        {statusMessage ? (
          <p className="new-gym-status-message" title={statusMessage}>
            {statusMessage}
          </p>
        ) : (
          <div className="new-gym-track">
          <NewGymItems gyms={gyms} duplicate />
          <NewGymItems gyms={gyms} />
          <NewGymItems gyms={gyms} duplicate />
        </div>
      )}
    </div>

      <style jsx>{`
        .new-gym-status-message {
          overflow: hidden;
          margin: 0;
          padding: 0 23px;
          color: #8b949e;
          font-size: 1rem;
          line-height: 49px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 620px) {
          .new-gym-status-message {
            padding: 0 10px;
            font-size: 0.78rem;
          }
        }
      `}</style>
    </aside>
  );
}
