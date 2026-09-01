import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import EventCard from "../../components/events/EventCard";
import { shouldShowOnEventsPage } from "../../lib/event-selection";
import type { PokemonGoEventSummary } from "../../lib/events";
import { getEventsPageData } from "../../lib/events-server";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  eventJsonLd,
  stringifyJsonLd,
} from "../../lib/seo";

interface EventPageProps {
  event: PokemonGoEventSummary;
}

function metaDescription(event: PokemonGoEventSummary): string {
  const source =
    event.description?.replace(/\s+/g, " ").trim() ||
    `Times, bonuses, wild spawns and raids for ${event.name} in Pokémon GO, with local information for players in Leigh, Greater Manchester.`;

  if (source.length <= 160) return source;
  return `${source.slice(0, 157).trimEnd()}…`;
}

function formatEventRange(start: string, end: string): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(value));

  return `${format(start)} – ${format(end)}`;
}

export const getServerSideProps: GetServerSideProps<EventPageProps> = async (
  context,
) => {
  const eventID = context.params?.eventID;

  if (typeof eventID !== "string" || !eventID.trim()) {
    return { notFound: true };
  }

  try {
    const data = await getEventsPageData(200);
    const event = data.events
      .filter(shouldShowOnEventsPage)
      .find((candidate) => candidate.eventID === eventID);

    if (!event) {
      return { notFound: true };
    }

    return { props: { event } };
  } catch {
    return { notFound: true };
  }
};

export default function EventPage({
  event,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const canonicalUrl = absoluteUrl(`/events/${encodeURIComponent(event.eventID)}`);
  const description = metaDescription(event);
  const breadcrumbData = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Pokémon GO events", path: "/events" },
    { name: event.name, path: `/events/${encodeURIComponent(event.eventID)}` },
  ]);
  const structuredEvent = eventJsonLd(event);

  return (
    <>
      <Head>
        <title>{event.name} – Pokémon GO Event | LeighPogo</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${event.name} – Pokémon GO Event`} />
        <meta property="og:description" content={description} />
        {event.image && <meta property="og:image" content={event.image} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbData) }}
        />
        {structuredEvent && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: stringifyJsonLd(structuredEvent) }}
          />
        )}
      </Head>

      <main className="container event-detail-page">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/events">Events</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{event.name}</span>
        </nav>

        <header className="event-detail-intro">
          <p className="eyebrow">Pokémon GO event • Leigh, Greater Manchester</p>
          <h1>{event.name}</h1>
          <p className="event-date">{formatEventRange(event.start, event.end)}</p>
          <p className="intro-copy">
            {event.description?.trim() ||
              "Event details, spawns, raids and bonuses for the Leigh Pokémon GO community."}
          </p>
        </header>

        <section aria-label={`${event.name} event details`}>
          <EventCard event={event} />
        </section>

        <nav className="event-detail-actions" aria-label="More LeighPogo event pages">
          <Link href="/events">← See all Pokémon GO events</Link>
          <Link href="/friend-codes">Leigh Pokémon GO friend codes →</Link>
        </nav>
      </main>

      <style jsx>{`
        .event-detail-page {
          max-width: 880px;
          padding-top: 28px;
          padding-bottom: 56px;
        }

        .breadcrumbs {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 18px;
          color: #8b949e;
          font-size: 0.82rem;
        }

        .breadcrumbs a,
        .event-detail-actions a {
          color: #79c0ff;
        }

        .event-detail-intro {
          margin-bottom: 20px;
          padding: 26px;
          border: 1px solid #30363d;
          border-radius: 14px;
          background: linear-gradient(135deg, #161b22 0%, #0d1117 100%);
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #58a6ff;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          color: #f0f6fc;
          font-size: clamp(2rem, 6vw, 3.1rem);
          line-height: 1.08;
        }

        .event-date {
          margin: 14px 0 0;
          color: #c9d1d9;
          font-weight: 700;
        }

        .intro-copy {
          margin: 12px 0 0;
          color: #8b949e;
          line-height: 1.65;
        }

        .event-detail-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 12px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #30363d;
        }

        @media (max-width: 620px) {
          .event-detail-intro {
            padding: 20px;
          }

          .event-detail-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </>
  );
}
