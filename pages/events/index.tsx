import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import EventCard from "../../components/events/EventCard";
import {
  EVENT_DATA_CREDITS,
  type PokemonGoEventSummary,
} from "../../lib/events";
import { shouldShowOnEventsPage } from "../../lib/event-selection";
import { getEventsPageData } from "../../lib/events-server";

interface EventsPageProps {
  events: PokemonGoEventSummary[];
  fetchedAt: string | null;
  isStale: boolean;
  warning: string | null;
  feedError: string | null;
}

export const getServerSideProps: GetServerSideProps<EventsPageProps> = async () => {
  try {
    const data = await getEventsPageData();

    return {
      props: {
        ...data,
        events: data.events.filter(shouldShowOnEventsPage),
        feedError: null,
      },
    };
  } catch (error) {
    return {
      props: {
        events: [],
        fetchedAt: null,
        isStale: true,
        warning: null,
        feedError:
          error instanceof Error
            ? error.message
            : "The events feed could not be loaded.",
      },
    };
  }
};

function eventTargetId(eventID: string): string {
  return `event-${encodeURIComponent(eventID)}`;
}

function formatFetchedAt(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function EventsPage({
  events,
  fetchedAt,
  isStale,
  warning,
  feedError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedType, setSelectedType] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";
  const formattedFetchedAt = formatFetchedAt(fetchedAt);
  const selectedEventID =
    router.isReady && typeof router.query.event === "string"
      ? router.query.event
      : null;

  const eventTypes = useMemo(() => {
    const labels = new Map<string, string>();

    events.forEach((event) => {
      if (!labels.has(event.eventType)) {
        labels.set(event.eventType, event.heading);
      }
    });

    return Array.from(labels, ([value, label]) => ({ value, label })).sort(
      (left, right) => left.label.localeCompare(right.label),
    );
  }, [events]);

  const visibleEvents = useMemo(
    () =>
      selectedType === "all"
        ? events
        : events.filter((event) => event.eventType === selectedType),
    [events, selectedType],
  );

  useEffect(() => {
    if (!selectedEventID) {
      return;
    }

    setSelectedType("all");
    const scrollTimer = window.setTimeout(() => {
      const target = document.getElementById(eventTargetId(selectedEventID));

      if (!target) {
        return;
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
      target.focus({ preventScroll: true });
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [selectedEventID, visibleEvents]);

  async function handleAdminRefresh() {
    setRefreshing(true);
    setRefreshMessage(null);

    try {
      const response = await fetch("/api/admin/events/refresh", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "The event refresh failed.");
      }

      setRefreshMessage(payload.message || "Event data refreshed. Reloading…");
      window.location.reload();
    } catch (error) {
      setRefreshMessage(
        error instanceof Error ? error.message : "The event refresh failed.",
      );
      setRefreshing(false);
    }
  }

  return (
    <>
      <Head>
        <title>Events | Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content="Current and upcoming Pokémon Go events for the Leigh community."
        />
      </Head>

      <main className="container events-page">
        <section className="events-intro">
          <p className="eyebrow">What’s happening in Pokémon Go</p>
          <h1>Events</h1>
          <p>
            Current and upcoming special events, spotlight hours, raid hours and
            other scheduled Pokémon Go activity. Current 5-star, Shadow and Mega
            raid bosses are shown in the raid bar above.
          </p>
          {formattedFetchedAt && (
            <p className="updated-at">
              Event data fetched {formattedFetchedAt}
              {isStale ? " (cached copy)" : ""}.
            </p>
          )}
        </section>

        {isAdmin && (
          <section className="admin-refresh" aria-label="Event administration">
            <div>
              <h2>Event data administration</h2>
              <p>
                The site refreshes its local event cache automatically when it
                becomes seven days old. Use this only when an immediate update is
                needed.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdminRefresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh events now"}
            </button>
            {refreshMessage && (
              <p className="refresh-message" role="status">
                {refreshMessage}
              </p>
            )}
          </section>
        )}

        {warning && (
          <section className="events-warning" role="status">
            <strong>Using the previous cached event list.</strong>
            <p>{warning}</p>
          </section>
        )}

        {eventTypes.length > 1 && (
          <section className="events-toolbar" aria-label="Event filters">
            <label htmlFor="event-type">Show event type</label>
            <select
              id="event-type"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
            >
              <option value="all">All events</option>
              {eventTypes.map((eventType) => (
                <option key={eventType.value} value={eventType.value}>
                  {eventType.label}
                </option>
              ))}
            </select>
            <p>
              Showing {visibleEvents.length} of {events.length} upcoming events.
            </p>
          </section>
        )}

        {feedError ? (
          <section className="events-message" role="alert">
            <h2>Events temporarily unavailable</h2>
            <p>{feedError}</p>
          </section>
        ) : visibleEvents.length > 0 ? (
          <section className="events-grid" aria-label="Upcoming events">
            {visibleEvents.map((event) => {
              const isSelected = event.eventID === selectedEventID;

              return (
                <div
                  key={event.eventID}
                  id={eventTargetId(event.eventID)}
                  className={`event-target${isSelected ? " selected" : ""}`}
                  tabIndex={-1}
                >
                  <EventCard event={event} />
                </div>
              );
            })}
          </section>
        ) : (
          <section className="events-message">
            <h2>No matching events</h2>
            <p>Try selecting a different event type.</p>
          </section>
        )}

        <footer className="events-credits">
          <p>
            Event data provided by{" "}
            <a
              href={EVENT_DATA_CREDITS.leekDuckUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              LeekDuck
            </a>{" "}
            via{" "}
            <a
              href={EVENT_DATA_CREDITS.scrapedDuckUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              ScrapedDuck
            </a>
            .
          </p>
          <p>
            Leigh Pokémon Go Community is not affiliated with Niantic, The
            Pokémon Company or Nintendo.
          </p>
        </footer>
      </main>

      <style jsx>{`
        .events-page {
          padding-top: 32px;
          padding-bottom: 56px;
        }

        .events-intro {
          margin-bottom: 20px;
          padding: 28px;
          border: 1px solid #30363d;
          border-radius: 12px;
          background: linear-gradient(135deg, #161b22 0%, #0d1117 100%);
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #58a6ff;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 5vw, 3rem);
        }

        .events-intro > p:not(.eyebrow):not(.updated-at) {
          max-width: 680px;
          margin: 12px 0 0;
          color: #c9d1d9;
          line-height: 1.65;
        }

        .updated-at {
          margin: 14px 0 0;
          color: #8b949e;
          font-size: 0.82rem;
        }

        .admin-refresh {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 12px 20px;
          margin-bottom: 20px;
          padding: 18px;
          border: 1px solid #2ea043;
          border-radius: 10px;
          background: #161b22;
        }

        .admin-refresh h2 {
          margin: 0 0 6px;
          font-size: 1.05rem;
        }

        .admin-refresh p {
          margin: 0;
          color: #8b949e;
          line-height: 1.5;
        }

        .admin-refresh button:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .refresh-message {
          grid-column: 1 / -1;
          color: #a5d6ff !important;
        }

        .events-warning {
          margin-bottom: 20px;
          padding: 16px;
          border: 1px solid #9e6a03;
          border-radius: 10px;
          background: #2d2208;
          color: #f2cc60;
        }

        .events-warning p {
          margin: 6px 0 0;
        }

        .events-toolbar {
          display: grid;
          grid-template-columns: minmax(180px, 280px) 1fr;
          align-items: end;
          gap: 8px 18px;
          margin-bottom: 20px;
          padding: 16px;
          border: 1px solid #30363d;
          border-radius: 10px;
          background: #161b22;
        }

        .events-toolbar label {
          grid-column: 1;
          margin: 0;
          color: #f0f6fc;
          font-size: 0.88rem;
        }

        .events-toolbar select {
          grid-column: 1;
        }

        .events-toolbar p {
          grid-column: 2;
          grid-row: 2;
          align-self: center;
          margin: 0;
          color: #8b949e;
          font-size: 0.88rem;
        }

        .events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .event-target {
          min-width: 0;
          border-radius: 12px;
          scroll-margin-top: 160px;
          outline: 3px solid transparent;
          transition:
            outline-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .event-target:focus {
          outline-color: transparent;
        }

        .event-target.selected {
          outline-color: #58a6ff;
          box-shadow: 0 0 0 5px rgba(88, 166, 255, 0.2);
        }

        .events-message {
          padding: 24px;
          border: 1px dashed #30363d;
          border-radius: 10px;
          color: #8b949e;
          text-align: center;
        }

        .events-message h2 {
          margin-bottom: 8px;
          color: #f0f6fc;
        }

        .events-credits {
          margin-top: 32px;
          padding: 20px;
          border-top: 1px solid #30363d;
          color: #8b949e;
          font-size: 0.82rem;
          line-height: 1.6;
          text-align: center;
        }

        .events-credits p + p {
          margin-top: 6px;
        }

        .events-credits a {
          color: #58a6ff;
        }

        @media (max-width: 620px) {
          .events-intro {
            padding: 22px;
          }

          .admin-refresh,
          .events-toolbar {
            grid-template-columns: 1fr;
          }

          .admin-refresh button {
            width: 100%;
          }

          .events-toolbar label,
          .events-toolbar select,
          .events-toolbar p {
            grid-column: 1;
            grid-row: auto;
          }
        }
      `}</style>
    </>
  );
}
