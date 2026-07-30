import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

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

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export default function NewGymTicker() {
  const { status } = useSession();
  const [gyms, setGyms] = useState<NewGymItem[]>([]);

  useEffect(() => {
    if (status !== "authenticated") {
      setGyms([]);
      return;
    }

    let controller: AbortController | null = null;

    async function loadGyms() {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch("/api/gyms/new", {
          signal: controller.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          setGyms([]);
          return;
        }

        const payload = (await response.json()) as NewGymPayload;
        setGyms(Array.isArray(payload.gyms) ? payload.gyms : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setGyms([]);
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

  if (status !== "authenticated") {
    return null;
  }

  const items = gyms.map((gym) => (
    <Link key={gym.id} href={`/gyms?gym=${encodeURIComponent(gym.id)}`} className="new-gym-item">
      <strong>{gym.displayName}</strong>
      {gym.alias && <span className="official-name">({gym.name})</span>}
    </Link>
  ));

  return (
    <aside className="new-gym-ticker" aria-label="Newly added gyms">
      <Link href="/gyms" className="new-gym-label">
        <span aria-hidden="true">✨</span>
        <strong>New gyms</strong>
      </Link>
      <div className="new-gym-viewport">
        {gyms.length === 0 ? (
          <p className="new-gym-empty-message">
            No newly added gyms in the last 7 days.
          </p>
        ) : (
          <div className="new-gym-track">
            <div className="new-gym-copy">{items}</div>
            <div className="new-gym-copy" aria-hidden="true">{items}</div>
          </div>
        )}
      </div>

      <style jsx>{`
        .new-gym-empty-message {
          margin: 0;
          padding: 0 23px;
          color: #8b949e;
          font-size: 1rem;
          line-height: 49px;
          white-space: nowrap;
        }
      `}</style>
    </aside>
  );
}
