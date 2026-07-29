import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";

interface GuideLayoutProps {
  title: string;
  description?: string;
  date?: string;
  children: ReactNode;
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

export default function GuideLayout({
  title,
  description,
  date,
  children,
}: GuideLayoutProps) {
  const publishedDate = formatDate(date);

  return (
    <>
      <Head>
        <title>{title} | Leigh Pokémon Go Guides</title>
        {description && <meta name="description" content={description} />}
      </Head>

      <main className="container guide-page">
        <Link href="/guides" className="back-link">
          ← All guides
        </Link>

        <article className="guide-shell">
          <header>
            <p className="eyebrow">Community guide</p>
            <h1>{title}</h1>
            {description && <p className="description">{description}</p>}
            {publishedDate && <time dateTime={date}>{publishedDate}</time>}
          </header>

          {children}
        </article>
      </main>

      <style jsx>{`
        .guide-page {
          padding-top: 32px;
          padding-bottom: 56px;
        }

        .back-link {
          display: inline-block;
          margin-bottom: 18px;
          color: #58a6ff;
          text-decoration: none;
        }

        .back-link:hover,
        .back-link:focus-visible {
          text-decoration: underline;
        }

        .guide-shell {
          overflow: hidden;
          border: 1px solid #30363d;
          border-radius: 12px;
          background: #161b22;
        }

        header {
          padding: 28px;
          border-bottom: 1px solid #30363d;
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
          line-height: 1.1;
        }

        .description {
          max-width: 720px;
          margin: 14px 0 0;
          color: #c9d1d9;
          font-size: 1.05rem;
          line-height: 1.65;
        }

        time {
          display: block;
          margin-top: 16px;
          color: #8b949e;
          font-size: 0.9rem;
        }

        @media (max-width: 600px) {
          header {
            padding: 22px;
          }
        }
      `}</style>
    </>
  );
}
