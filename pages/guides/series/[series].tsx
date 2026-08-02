import Head from "next/head";
import Link from "next/link";
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import GuideCard from "../../../components/guides/GuideCard";
import {
  getGuideSeriesTitle,
  getGuidesBySeries,
} from "../../../lib/guide-series";
import { getAllGuides, type GuideSummary } from "../../../lib/guides";

interface GuideSeriesPageProps {
  seriesSlug: string;
  seriesTitle: string;
  guides: GuideSummary[];
}

interface GuideSeriesPageParams extends ParsedUrlQuery {
  series: string;
}

export const getServerSideProps: GetServerSideProps<
  GuideSeriesPageProps,
  GuideSeriesPageParams
> = async ({ params }) => {
  const seriesSlug = params?.series ?? "";
  const guides = getGuidesBySeries(seriesSlug, getAllGuides());

  if (guides.length === 0) {
    return { notFound: true };
  }

  return {
    props: {
      seriesSlug,
      seriesTitle: getGuideSeriesTitle(seriesSlug),
      guides,
    },
  };
};

export default function GuideSeriesPage({
  seriesSlug,
  seriesTitle,
  guides,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>{seriesTitle} | Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content={`Browse all ${guides.length} guides in the ${seriesTitle} series.`}
        />
      </Head>

      <main className="container guide-series-page">
        <Link href="/guides" className="back-link">
          ← All guide series
        </Link>

        <section className="series-intro">
          <p className="eyebrow">Guide series</p>
          <h1>{seriesTitle}</h1>
          <p>
            {guides.length === 1
              ? "This series currently contains one guide."
              : `This series contains ${guides.length} guides, shown in their recommended order.`}
          </p>
          <small>{seriesSlug}</small>
        </section>

        <section className="guides-grid" aria-label={`${seriesTitle} guides`}>
          {guides.map((guide) => (
            <GuideCard key={guide.slug} guide={guide} />
          ))}
        </section>
      </main>

      <style jsx>{`
        .guide-series-page {
          padding-top: 32px;
          padding-bottom: 56px;
        }

        .back-link {
          display: inline-flex;
          margin-bottom: 18px;
          color: #79c0ff;
          font-weight: 700;
          text-decoration: none;
        }

        .back-link:hover,
        .back-link:focus-visible {
          text-decoration: underline;
        }

        .series-intro {
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

        .series-intro > p:last-of-type {
          max-width: 680px;
          margin: 12px 0 0;
          color: #c9d1d9;
          line-height: 1.65;
        }

        .series-intro small {
          display: inline-block;
          margin-top: 14px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #21262d;
          color: #8b949e;
          font-family: monospace;
        }

        .guides-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
        }
      `}</style>
    </>
  );
}
