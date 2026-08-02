import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import GuideCard from "../../components/guides/GuideCard";
import {
  getGuideSeriesSummaries,
  type GuideSeriesSummary,
} from "../../lib/guide-series";
import { getAllGuides, type GuideSummary } from "../../lib/guides";

interface GuidesIndexProps {
  series: GuideSeriesSummary[];
  standaloneGuides: GuideSummary[];
}

export const getServerSideProps: GetServerSideProps<GuidesIndexProps> = async () => {
  const guides = getAllGuides();

  return {
    props: {
      series: getGuideSeriesSummaries(guides),
      standaloneGuides: guides.filter((guide) => !guide.series),
    },
  };
};

export default function GuidesIndexPage({
  series,
  standaloneGuides,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const hasGuides = series.length > 0 || standaloneGuides.length > 0;

  return (
    <>
      <Head>
        <title>Guides | Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content="Community-written Pokémon Go guides for players in Leigh."
        />
      </Head>

      <main className="container guides-page">
        <section className="guides-intro">
          <p className="eyebrow">Community knowledge</p>
          <h1>Guides</h1>
          <p>
            Helpful walkthroughs and local tips, grouped into guide series so
            related topics are easier to follow.
          </p>
        </section>

        {hasGuides ? (
          <>
            {series.length > 0 && (
              <section className="guide-section" aria-labelledby="guide-series-heading">
                <h2 id="guide-series-heading">Guide series</h2>
                <div className="guides-grid">
                  {series.map((guideSeries) => (
                    <Link
                      key={guideSeries.slug}
                      href={`/guides/series/${guideSeries.slug}`}
                      className="series-card"
                    >
                      <article>
                        <div className="series-card__heading">
                          <h3>{guideSeries.title}</h3>
                          <span aria-hidden="true">→</span>
                        </div>
                        <p>{guideSeries.description}</p>
                        <small>
                          {guideSeries.guideCount} {guideSeries.guideCount === 1 ? "guide" : "guides"}
                        </small>
                      </article>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {standaloneGuides.length > 0 && (
              <section className="guide-section" aria-labelledby="individual-guides-heading">
                <h2 id="individual-guides-heading">Individual guides</h2>
                <div className="guides-grid">
                  {standaloneGuides.map((guide) => (
                    <GuideCard key={guide.slug} guide={guide} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="empty-state">
            <h2>No guides yet</h2>
            <p>Create the first guide from the admin content creator.</p>
          </section>
        )}
      </main>

      <style jsx>{`
        .guides-page {
          padding-top: 32px;
          padding-bottom: 56px;
        }

        .guides-intro {
          margin-bottom: 24px;
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

        .guides-intro > p:last-child {
          max-width: 680px;
          margin: 12px 0 0;
          color: #c9d1d9;
          line-height: 1.65;
        }

        .guide-section + .guide-section {
          margin-top: 32px;
        }

        .guide-section > h2 {
          margin: 0 0 14px;
          font-size: 1.35rem;
        }

        .guides-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }

        .series-card {
          display: block;
          color: inherit;
          text-decoration: none;
        }

        .series-card article {
          height: 100%;
          padding: 20px;
          border: 1px solid #30363d;
          border-radius: 10px;
          background: #161b22;
          transition:
            border-color 0.15s ease,
            transform 0.15s ease;
        }

        .series-card:hover article,
        .series-card:focus-visible article {
          border-color: #58a6ff;
          transform: translateY(-2px);
        }

        .series-card__heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .series-card h3 {
          margin: 0;
          font-size: 1.25rem;
        }

        .series-card__heading span {
          color: #58a6ff;
          font-size: 1.4rem;
        }

        .series-card p {
          margin: 10px 0 0;
          color: #8b949e;
          line-height: 1.6;
        }

        .series-card small {
          display: inline-block;
          margin-top: 16px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #21262d;
          color: #c9d1d9;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .empty-state {
          padding: 24px;
          border: 1px dashed #30363d;
          border-radius: 10px;
          color: #8b949e;
          text-align: center;
        }

        .empty-state h2 {
          margin-bottom: 8px;
          color: #f0f6fc;
        }
      `}</style>
    </>
  );
}
