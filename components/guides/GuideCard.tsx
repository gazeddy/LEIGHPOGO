import Link from "next/link";
import type { GuideSummary } from "../../lib/guides";

interface GuideCardProps {
  guide: GuideSummary;
}

function formatDate(date?: string): string | null {
  if (!date) {
    return null;
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

export default function GuideCard({ guide }: GuideCardProps) {
  const publishedDate = formatDate(guide.date);

  return (
    <Link href={`/guides/${guide.slug}`} className="guide-card">
      <article>
        <div className="guide-card__heading">
          <h2>{guide.title}</h2>
          <span aria-hidden="true">→</span>
        </div>
        {guide.description && <p>{guide.description}</p>}
        {publishedDate && <time dateTime={guide.date}>{publishedDate}</time>}
      </article>

      <style jsx>{`
        .guide-card {
          display: block;
          color: inherit;
          text-decoration: none;
        }

        article {
          height: 100%;
          padding: 20px;
          border: 1px solid #30363d;
          border-radius: 10px;
          background: #161b22;
          transition:
            border-color 0.15s ease,
            transform 0.15s ease;
        }

        .guide-card:hover article,
        .guide-card:focus-visible article {
          border-color: #58a6ff;
          transform: translateY(-2px);
        }

        .guide-card__heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        span {
          color: #58a6ff;
          font-size: 1.4rem;
        }

        p {
          margin: 10px 0 0;
          color: #8b949e;
          line-height: 1.6;
        }

        time {
          display: block;
          margin-top: 16px;
          color: #8b949e;
          font-size: 0.875rem;
        }
      `}</style>
    </Link>
  );
}
