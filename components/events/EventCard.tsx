import Image, { type ImageLoaderProps } from "next/image";
import { useEffect, useState } from "react";
import type {
  PokemonGoEventPokemon,
  PokemonGoEventSummary,
} from "../../lib/events";

interface EventCardProps {
  event: PokemonGoEventSummary;
}

const POKEMON_PREVIEW_LIMIT = 8;
const BONUS_PREVIEW_LIMIT = 3;

function passthroughImageLoader({ src }: ImageLoaderProps): string {
  return src;
}

function canOptimizeEventImage(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) {
    return true;
  }

  try {
    const url = new URL(src);

    return (
      url.protocol === "https:" &&
      url.hostname === "cdn.leekduck.com" &&
      url.pathname.startsWith("/assets/img/events/")
    );
  } catch {
    return false;
  }
}

function eventInfographicUrl(eventID: string): string {
  const safe =
    eventID
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "event";

  return `/generated/events/${safe}-leighpogo.png`;
}

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

function formatDate(value: string): string {
  const { date, timeZone } = dateForDisplay(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string): string {
  const { date, timeZone } = dateForDisplay(value);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatEventRange(start: string, end: string): string {
  const sameDate = start.slice(0, 10) === end.slice(0, 10);

  if (sameDate) {
    return `${formatDate(start)}, ${formatTime(start)}–${formatTime(end)}`;
  }

  return `${formatDate(start)}, ${formatTime(start)} – ${formatDate(end)}, ${formatTime(end)}`;
}

function compactDescription(value: string | null | undefined): string | null {
  if (!value) return null;

  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (compact.length <= 240) return compact;

  return `${compact.slice(0, 237).trimEnd()}…`;
}

function dedupePokemon(items: PokemonGoEventPokemon[]): PokemonGoEventPokemon[] {
  const seen = new Set<string>();

  return items.filter((pokemon) => {
    const key = pokemon.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function raidPokemon(event: PokemonGoEventSummary): PokemonGoEventPokemon[] {
  const scheduled = (event.raidSchedule ?? []).flatMap((entry) =>
    entry.bosses.map((boss) => ({
      name: boss.name,
      image: boss.image,
      canBeShiny: boss.canBeShiny,
    })),
  );

  return dedupePokemon([...scheduled, ...(event.featuredRaids ?? [])]);
}

function PokemonTiles({ items }: { items: PokemonGoEventPokemon[] }) {
  return (
    <div className="event-pokemon-grid">
      {items.map((pokemon) => {
        const optimizeImage = pokemon.image
          ? canOptimizeEventImage(pokemon.image)
          : false;

        return (
          <div key={pokemon.name} className="event-pokemon-tile">
            <div className="event-pokemon-image-wrap">
              {pokemon.image ? (
                <Image
                  src={pokemon.image}
                  alt=""
                  width={52}
                  height={52}
                  className="event-pokemon-image"
                  loading="lazy"
                  loader={optimizeImage ? undefined : passthroughImageLoader}
                  unoptimized={!optimizeImage}
                />
              ) : (
                <span className="event-pokemon-placeholder" aria-hidden="true">
                  {pokemon.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              {pokemon.canBeShiny === true && (
                <span
                  className="event-pokemon-shiny"
                  aria-label="Shiny available"
                  title="Shiny available"
                >
                  ✨
                </span>
              )}
            </div>
            <span className="event-pokemon-name">{pokemon.name}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function EventCard({ event }: EventCardProps) {
  const tags = event.tags ?? [];
  const campfireUrl = event.campfireUrl?.trim() || null;
  const infographicUrl = eventInfographicUrl(event.eventID);
  const [hasInfographic, setHasInfographic] = useState(false);
  const optimizeEventImage = event.image
    ? canOptimizeEventImage(event.image)
    : false;
  const wildSpawns = dedupePokemon(event.wildSpawns ?? []);
  const raids = raidPokemon(event);
  const bonuses = event.bonuses ?? [];
  const description = compactDescription(event.description);
  const visibleWildSpawns = wildSpawns.slice(0, POKEMON_PREVIEW_LIMIT);
  const hiddenWildSpawns = wildSpawns.slice(POKEMON_PREVIEW_LIMIT);
  const visibleRaids = raids.slice(0, POKEMON_PREVIEW_LIMIT);
  const hiddenRaids = raids.slice(POKEMON_PREVIEW_LIMIT);
  const visibleBonuses = bonuses.slice(0, BONUS_PREVIEW_LIMIT);
  const hiddenBonuses = bonuses.slice(BONUS_PREVIEW_LIMIT);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const retryDelays = [0, 5000, 15000];

    async function checkInfographic(attempt: number): Promise<void> {
      try {
        const response = await fetch(infographicUrl, {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });

        if (cancelled) return;

        if (response.ok && response.headers.get("content-type")?.includes("image/png")) {
          setHasInfographic(true);
          return;
        }
      } catch {
        if (cancelled) return;
      }

      const nextAttempt = attempt + 1;
      if (nextAttempt < retryDelays.length) {
        retryTimer = setTimeout(
          () => void checkInfographic(nextAttempt),
          retryDelays[nextAttempt],
        );
      }
    }

    setHasInfographic(false);
    void checkInfographic(0);

    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [infographicUrl]);

  return (
    <article className="event-card">
      {event.image && (
        <div className="event-image-wrapper">
          <Image
            src={event.image}
            alt=""
            className="event-image"
            fill
            sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
            loading="lazy"
            loader={optimizeEventImage ? undefined : passthroughImageLoader}
            unoptimized={!optimizeEventImage}
          />
        </div>
      )}

      <div className="event-content">
        <div className="event-heading-row">
          <p className="event-type">{event.heading}</p>
          <div className="event-heading-actions">
            {hasInfographic && (
              <a
                href={infographicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="event-infographic-pill"
                aria-label={`View ${event.name} infographic`}
              >
                Infographic <span aria-hidden="true">↗</span>
              </a>
            )}
            {campfireUrl && (
              <a
                href={campfireUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="event-campfire-pill"
                aria-label="View meetup on Campfire"
              >
                Campfire <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </div>
        <h2>{event.name}</h2>
        <p className="event-time">{formatEventRange(event.start, event.end)}</p>

        {description && <p className="event-description">{description}</p>}

        {wildSpawns.length > 0 && (
          <section className="event-highlight" aria-label="Wild spawns">
            <div className="event-highlight-heading">
              <h3>Wild spawns</h3>
              <span>{wildSpawns.length}</span>
            </div>
            <PokemonTiles items={visibleWildSpawns} />
            {hiddenWildSpawns.length > 0 && (
              <details className="event-more">
                <summary>Show {hiddenWildSpawns.length} more wild spawns</summary>
                <PokemonTiles items={hiddenWildSpawns} />
              </details>
            )}
          </section>
        )}

        {raids.length > 0 && (
          <section className="event-highlight" aria-label="Event raids">
            <div className="event-highlight-heading">
              <h3>Raids</h3>
              <span>{raids.length}</span>
            </div>
            <PokemonTiles items={visibleRaids} />
            {hiddenRaids.length > 0 && (
              <details className="event-more">
                <summary>Show {hiddenRaids.length} more raid bosses</summary>
                <PokemonTiles items={hiddenRaids} />
              </details>
            )}
          </section>
        )}

        {bonuses.length > 0 && (
          <section className="event-highlight event-bonuses" aria-label="Event bonuses">
            <div className="event-highlight-heading">
              <h3>Event boosts</h3>
              <span>{bonuses.length}</span>
            </div>
            <ul>
              {visibleBonuses.map((bonus) => (
                <li key={bonus}>{bonus}</li>
              ))}
            </ul>
            {hiddenBonuses.length > 0 && (
              <details className="event-more">
                <summary>Show {hiddenBonuses.length} more boosts</summary>
                <ul>
                  {hiddenBonuses.map((bonus) => (
                    <li key={bonus}>{bonus}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {tags.length > 0 && (
          <div className="event-tags" aria-label="Event tags">
            {tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .event-card {
          display: flex;
          min-height: 100%;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #30363d;
          border-radius: 14px;
          background: #161b22;
          transition:
            transform 0.15s ease,
            border-color 0.15s ease;
        }

        .event-card:hover {
          transform: translateY(-2px);
          border-color: #58a6ff;
        }

        .event-image-wrapper {
          position: relative;
          overflow: hidden;
          aspect-ratio: 16 / 9;
          background: #0d1117;
        }

        .event-image {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .event-content {
          display: flex;
          flex: 1;
          flex-direction: column;
          padding: 18px;
        }

        .event-heading-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .event-heading-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          margin-left: auto;
        }

        .event-type,
        .event-infographic-pill,
        .event-campfire-pill {
          margin: 0;
          padding: 5px 9px;
          border: 1px solid #30363d;
          border-radius: 999px;
          background: #0d1117;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .event-type {
          color: #79c0ff;
        }

        .event-infographic-pill {
          border-color: rgba(182, 108, 255, 0.55);
          color: #d8b4ff;
          text-decoration: none;
        }

        .event-infographic-pill:hover,
        .event-infographic-pill:focus-visible {
          border-color: #b66cff;
          color: #f0dcff;
          text-decoration: underline;
        }

        .event-campfire-pill {
          border-color: rgba(63, 185, 80, 0.45);
          color: #7ee787;
          text-decoration: none;
        }

        .event-campfire-pill:hover,
        .event-campfire-pill:focus-visible {
          text-decoration: underline;
        }

        h2 {
          margin: 0;
          color: #f0f6fc;
          font-size: 1.16rem;
          line-height: 1.35;
        }

        .event-time {
          margin: 10px 0 0;
          color: #c9d1d9;
          font-size: 0.88rem;
          line-height: 1.55;
        }

        .event-description {
          margin: 12px 0 0;
          color: #8b949e;
          line-height: 1.55;
        }

        .event-highlight {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid #30363d;
        }

        .event-highlight-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .event-highlight h3 {
          margin: 0;
          color: #f0f6fc;
          font-size: 0.9rem;
        }

        .event-highlight-heading > span {
          min-width: 28px;
          padding: 3px 7px;
          border-radius: 999px;
          background: #21262d;
          color: #8b949e;
          font-size: 0.7rem;
          font-weight: 800;
          text-align: center;
        }

        .event-bonuses ul {
          margin: 0;
          padding-left: 20px;
          color: #c9d1d9;
        }

        .event-bonuses li + li {
          margin-top: 7px;
        }

        .event-more {
          margin-top: 10px;
          color: #8b949e;
          font-size: 0.78rem;
        }

        .event-more summary {
          width: fit-content;
          cursor: pointer;
          color: #79c0ff;
          font-weight: 700;
        }

        .event-more[open] summary {
          margin-bottom: 10px;
        }

        .event-more ul {
          margin-top: 8px;
        }

        .event-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 14px;
        }

        .event-tags span {
          padding: 4px 7px;
          border-radius: 999px;
          background: #21262d;
          color: #c9d1d9;
          font-size: 0.72rem;
        }

        @media (max-width: 430px) {
          .event-heading-row {
            align-items: flex-start;
          }

          .event-heading-actions {
            gap: 5px;
          }

          .event-type,
          .event-infographic-pill,
          .event-campfire-pill {
            padding: 5px 7px;
            font-size: 0.64rem;
          }
        }
      `}</style>

      <style jsx global>{`
        .event-card .event-pokemon-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .event-card .event-pokemon-tile {
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 7px 4px;
          border: 1px solid #30363d;
          border-radius: 9px;
          background: #0d1117;
          text-align: center;
        }

        .event-card .event-pokemon-image-wrap {
          position: relative;
          display: grid;
          width: 52px;
          height: 52px;
          place-items: center;
        }

        .event-card .event-pokemon-image {
          width: 52px;
          height: 52px;
          object-fit: contain;
        }

        .event-card .event-pokemon-placeholder {
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border-radius: 50%;
          background: #21262d;
          color: #8b949e;
          font-weight: 900;
        }

        .event-card .event-pokemon-shiny {
          position: absolute;
          top: -2px;
          right: -3px;
          font-size: 0.78rem;
          filter: drop-shadow(0 0 4px rgba(242, 204, 96, 0.8));
        }

        .event-card .event-pokemon-name {
          width: 100%;
          overflow: hidden;
          color: #c9d1d9;
          font-size: 0.67rem;
          font-weight: 700;
          line-height: 1.2;
          text-overflow: ellipsis;
        }

        .event-target > .event-infographic-link {
          display: none !important;
        }

        @media (max-width: 420px) {
          .event-card .event-pokemon-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </article>
  );
}
