import Head from "next/head";
import type { GetStaticProps, InferGetStaticPropsType } from "next";
import { useMemo, useState } from "react";
import EventCard from "../../components/events/EventCard";
import {
  EVENT_DATA_CREDITS,
  getUpcomingEvents,
  type PokemonGoEventSummary,
} from "../../lib/events";

interface EventsPageProps {
  events: PokemonGoEventSummary[];
  updatedAt: string;
  feedError: string | null;
}

export const getStaticProps: GetStaticProps<EventsPageProps> = async () => {
  const updatedAt = new Date().toISOString();

  try {
    return {
      props: {
        events: await getUpcomingEvents(),
        updatedAt,
        feedError: null,
      },
      revalidate: 900,
    };
  } catch (error) {
    return {
      props: {
        events: [],
        updatedAt,
        feedError:
          error instanceof Error
            ? error.message
            : "The events feed could not be loaded.",
      },
      revalidate: 300,
    };
  }
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function EventsPage({
  events,
  updatedAt,
  feedError,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const [selectedType, setSelectedType] = useState("all");

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
            Current and upcoming events, raid rotations, spotlight hours and
            other scheduled Pokémon Go activity.
          </p>
          <p className="updated-at">Updated {formatUpdatedAt(updatedAt)}</p>
        </section>

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
            {visibleEvents.map((event) => (
              <EventCard key={event.eventID} event={event} />
            ))}
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
            Data is refreshed automatically. Leigh Pokémon Go Community is not
            affiliated with Niantic, The Pokémon Company or Nintendo.
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

          .events-toolbar {
            grid-template-columns: 1fr;
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
