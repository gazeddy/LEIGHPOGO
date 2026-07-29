import Head from "next/head";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import GuideCard from "../../components/guides/GuideCard";
import { getAllGuides, type GuideSummary } from "../../lib/guides";

interface GuidesIndexProps {
  guides: GuideSummary[];
}

export const getServerSideProps: GetServerSideProps<GuidesIndexProps> = async () => ({
  props: {
    guides: getAllGuides(),
  },
});

export default function GuidesIndexPage({
  guides,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
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
            Helpful walkthroughs and local tips, written in Markdown and published
            with the site.
          </p>
        </section>

        {guides.length > 0 ? (
          <section className="guides-grid" aria-label="Available guides">
            {guides.map((guide) => (
              <GuideCard key={guide.slug} guide={guide} />
            ))}
          </section>
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

        .guides-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
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
