import type { PokemonGoEventSummary } from "../../lib/events";

interface EventCardProps {
  event: PokemonGoEventSummary;
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

export default function EventCard({ event }: EventCardProps) {
  return (
    <article className="event-card">
      {event.image && (
        <div className="event-image-wrapper">
          <img
            src={event.image}
            alt=""
            className="event-image"
            loading="lazy"
          />
        </div>
      )}

      <div className="event-content">
        <p className="event-type">{event.heading}</p>
        <h2>{event.name}</h2>
        <p className="event-time">{formatEventRange(event.start, event.end)}</p>

        {event.link && (
          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="event-link"
          >
            View event details <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>

      <style jsx>{`
        .event-card {
          display: flex;
          min-height: 100%;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #30363d;
          border-radius: 12px;
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

        .event-type {
          align-self: flex-start;
          margin: 0 0 10px;
          padding: 5px 9px;
          border: 1px solid #30363d;
          border-radius: 999px;
          color: #79c0ff;
          background: #0d1117;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        h2 {
          margin: 0;
          color: #f0f6fc;
          font-size: 1.08rem;
          line-height: 1.35;
        }

        .event-time {
          margin: 12px 0 18px;
          color: #c9d1d9;
          font-size: 0.9rem;
          line-height: 1.55;
        }

        .event-link {
          margin-top: auto;
          color: #58a6ff;
          font-weight: 700;
          text-decoration: none;
        }

        .event-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </article>
  );
}
