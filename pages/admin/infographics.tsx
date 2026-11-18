import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import type { PokemonGoEventSummary } from "../../lib/events";
import { getInfographicEventsData } from "../../lib/infographic-events-server";
import { authOptions } from "../api/auth/[...nextauth]";

interface InfographicsAdminProps {
  events: PokemonGoEventSummary[];
  fetchedAt: string;
  warning: string | null;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function raidCount(event: PokemonGoEventSummary): number {
  const names = new Set<string>();

  for (const entry of event.raidSchedule ?? []) {
    for (const boss of entry.bosses) {
      names.add(boss.name.trim().toLowerCase());
    }
  }

  for (const boss of event.featuredRaids ?? []) {
    names.add(boss.name.trim().toLowerCase());
  }

  return names.size;
}

export const getServerSideProps: GetServerSideProps<InfographicsAdminProps> = async (
  context,
) => {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const data = await getInfographicEventsData(240);
  const events = data.events.filter((event) => (event.bonuses?.length ?? 0) > 0);

  return {
    props: {
      events,
      fetchedAt: data.fetchedAt,
      warning: data.warning,
    },
  };
};

export default function InfographicsAdminPage({
  events,
  fetchedAt,
  warning,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <main className="container infographic-admin">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Event infographics</h1>
          <p>
            Generate a 1080 × 1350 LeighPogo social graphic from freshly enriched
            event details. Bonuses, wild spawns and raid bosses shown below are the
            same data passed to the PNG renderer.
          </p>
        </div>
        <div className="header-links">
          <Link href="/admin/events">Event feed</Link>
          <Link href="/admin">Admin panel</Link>
        </div>
      </header>

      <section className="summary">
        <div>
          <strong>{events.length}</strong>
          <span>events ready for infographic generation</span>
        </div>
        <small>Primary event data fetched {formatDate(fetchedAt)}</small>
      </section>

      {warning && (
        <p className="notice warning">
          Infographic data warning: {warning}
        </p>
      )}

      <section className="event-list" aria-label="Events with bonuses">
        {events.map((event) => {
          const bonusCount = event.bonuses?.length ?? 0;
          const wildCount = event.wildSpawns?.length ?? 0;
          const raids = raidCount(event);
          const base = `/api/admin/event-infographic?eventID=${encodeURIComponent(
            event.eventID,
          )}`;

          return (
            <article key={event.eventID} className="event-row">
              <div className="event-copy">
                <span className="event-type">{event.heading}</span>
                <h2>{event.name}</h2>
                <p>
                  {formatDate(event.start)} – {formatDate(event.end)}
                </p>
                <div className="counts" aria-label="Infographic content summary">
                  <span>{bonusCount} bonuses</span>
                  <span>{wildCount} wild spawns</span>
                  <span>{raids} raid bosses</span>
                </div>
              </div>

              <div className="actions">
                <a href={base} target="_blank" rel="noopener noreferrer">
                  Preview PNG
                </a>
                <a href={`${base}&download=1`}>Download PNG</a>
              </div>
            </article>
          );
        })}
      </section>

      {events.length === 0 && (
        <p className="empty">No upcoming events currently contain bonus data.</p>
      )}

      <style jsx>{`
        .infographic-admin { padding-top: 28px; padding-bottom: 60px; }
        .page-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
        .page-header h1 { margin: 0; font-size: clamp(2rem, 6vw, 3.2rem); }
        .page-header p:last-child { max-width: 760px; color: #8b949e; line-height: 1.55; }
        .eyebrow { margin: 0 0 6px; color: #b66cff; font-size: .75rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .header-links { display: flex; flex-wrap: wrap; gap: 12px; }
        .header-links a { color: #58a6ff; white-space: nowrap; }
        .summary { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: center; margin: 22px 0; padding: 14px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; }
        .summary div { display: flex; gap: 8px; align-items: baseline; }
        .summary strong { color: #f0f6fc; font-size: 1.25rem; }
        .summary span, .summary small { color: #8b949e; }
        .notice { padding: 11px 14px; border-radius: 8px; }
        .notice.warning { border: 1px solid #d29922; background: rgba(210,153,34,.12); }
        .event-list { display: grid; gap: 14px; }
        .event-row { display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: center; padding: 18px; border: 1px solid #30363d; border-radius: 11px; background: #161b22; }
        .event-copy h2 { margin: 5px 0; font-size: 1.2rem; }
        .event-copy > p { margin: 0; color: #8b949e; }
        .event-type { color: #79c0ff; font-size: .72rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; }
        .counts { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        .counts span { padding: 5px 8px; border-radius: 999px; background: #21262d; color: #c9d1d9; font-size: .75rem; font-weight: 700; }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .actions a { display: inline-flex; align-items: center; justify-content: center; padding: 9px 12px; border: 1px solid #30363d; border-radius: 7px; background: #21262d; color: #f0f6fc; font-weight: 800; text-decoration: none; }
        .actions a:first-child { border-color: #238636; color: #7ee787; }
        .actions a:hover, .actions a:focus-visible { border-color: #58a6ff; }
        .empty { padding: 28px; border: 1px dashed #30363d; border-radius: 10px; color: #8b949e; text-align: center; }
        @media (max-width: 720px) {
          .page-header, .event-row { grid-template-columns: 1fr; flex-direction: column; }
          .actions { justify-content: flex-start; }
          .actions a { flex: 1 1 160px; }
        }
      `}</style>
    </main>
  );
}
