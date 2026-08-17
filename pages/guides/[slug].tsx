import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import GuideLayout from "../../components/guides/GuideLayout";
import MarkdownContent from "../../components/guides/MarkdownContent";
import {
  getAllGuides,
  getGuideBySlug,
  getGuideRelationships,
  type Guide,
  type GuideSummary,
} from "../../lib/guides";

interface GuidePageProps {
  guide: Guide;
  previousGuide: GuideSummary | null;
  nextGuide: GuideSummary | null;
  relatedGuides: GuideSummary[];
  seriesTitle: string | null;
  seriesPosition: number | null;
  seriesLength: number;
}

interface GuidePageParams extends ParsedUrlQuery {
  slug: string;
}

function passthroughImageLoader({ src }: ImageLoaderProps): string {
  return src;
}

function canOptimizeGuideImage(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//");
}

export const getServerSideProps: GetServerSideProps<
  GuidePageProps,
  GuidePageParams
> = async ({ params }) => {
  const guide = params?.slug ? getGuideBySlug(params.slug) : null;

  if (!guide) {
    return { notFound: true };
  }

  const relationships = getGuideRelationships(guide, getAllGuides());

  return {
    props: {
      guide,
      ...relationships,
    },
  };
};

export default function GuidePage({
  guide,
  previousGuide,
  nextGuide,
  relatedGuides,
  seriesTitle,
  seriesPosition,
  seriesLength,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { data: session } = useSession();
  const isAdmin =
    (session?.user as { role?: string } | undefined)?.role === "admin";
  const hasSequence = previousGuide || nextGuide;
  const optimizeCoverImage = guide.coverImage
    ? canOptimizeGuideImage(guide.coverImage)
    : false;

  return (
    <GuideLayout
      title={guide.title}
      description={guide.description}
      date={guide.date}
    >
      {isAdmin && (
        <div className="guide-admin-actions">
<Link
  href={{ pathname: "/admin/content", query: { guide: guide.slug } }}
>
  Edit this guide
</Link>
        </div>
      )}

      {seriesTitle && (
        <p className="series-position">
          {seriesTitle}
          {seriesPosition && seriesLength > 0
            ? ` · Part ${seriesPosition} of ${seriesLength}`
            : ""}
        </p>
      )}

      {guide.tags && guide.tags.length > 0 && (
        <div className="guide-page-tags" aria-label="Guide tags">
          {guide.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      )}

      {guide.coverImage && (
        <figure className="guide-cover">
          <Image
            src={guide.coverImage}
            alt={guide.coverImageAlt || guide.title}
            width={1600}
            height={900}
            sizes="(max-width: 900px) 100vw, 900px"
            className="guide-cover-image"
            priority
            loader={optimizeCoverImage ? undefined : passthroughImageLoader}
            unoptimized={!optimizeCoverImage}
          />
        </figure>
      )}

      <MarkdownContent content={guide.content} />

      {hasSequence && (
        <nav className="guide-sequence" aria-label="Guide series navigation">
          {previousGuide ? (
            <Link href={`/guides/${previousGuide.slug}`} className="sequence-link previous">
              <span>← Previous guide</span>
              <strong>{previousGuide.title}</strong>
            </Link>
          ) : (
            <span className="sequence-spacer" />
          )}

          {nextGuide ? (
            <Link href={`/guides/${nextGuide.slug}`} className="sequence-link next">
              <span>Next guide →</span>
              <strong>{nextGuide.title}</strong>
            </Link>
          ) : (
            <span className="sequence-spacer" />
          )}
        </nav>
      )}

      {relatedGuides.length > 0 && (
        <aside className="related-guides" aria-labelledby="related-guides-heading">
          <h2 id="related-guides-heading">Related guides</h2>
          <div>
            {relatedGuides.map((relatedGuide) => (
              <Link key={relatedGuide.slug} href={`/guides/${relatedGuide.slug}`}>
                <strong>{relatedGuide.title}</strong>
                {relatedGuide.description && <span>{relatedGuide.description}</span>}
              </Link>
            ))}
          </div>
        </aside>
      )}

      <style jsx>{`
        .guide-admin-actions {
display: flex;
justify-content: flex-end;
margin: 0 0 18px;
        }

        .guide-admin-actions a {
border: 1px solid #238636;
border-radius: 8px;
padding: 8px 12px;
background: rgba(35, 134, 54, 0.15);
color: #7ee787;
font-weight: 800;
text-decoration: none;
        }

        .guide-admin-actions a:hover,
        .guide-admin-actions a:focus-visible {
background: rgba(35, 134, 54, 0.3);
outline: none;
        }

        .guide-cover {
          margin: 0;
          border-top: 1px solid #30363d;
          border-bottom: 1px solid #30363d;
          background: #0d1117;
        }

        .guide-cover-image {
          display: block;
          width: 100%;
          height: auto;
          max-height: 540px;
          object-fit: cover;
        }

        .series-position {
          display: inline-flex;
          margin: 0 0 18px;
          padding: 6px 10px;
          border: 1px solid #1f6feb;
          border-radius: 999px;
          background: rgba(31, 111, 235, 0.12);
          color: #79c0ff;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .guide-page-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 22px;
        }

        .guide-page-tags span {
          padding: 5px 9px;
          border-radius: 999px;
          background: #21262d;
          color: #c9d1d9;
          font-size: 0.78rem;
        }

        .guide-sequence {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 26px;
          padding-top: 22px;
          border-top: 1px solid #30363d;
        }

        .sequence-link {
          display: grid;
          gap: 5px;
          min-width: 0;
          padding: 15px;
          border: 1px solid #30363d;
          border-radius: 10px;
          background: #161b22;
          color: #f0f6fc;
          text-decoration: none;
        }

        .sequence-link:hover,
        .sequence-link:focus-visible {
          border-color: #58a6ff;
          background: #1f2937;
          outline: none;
        }

        .sequence-link span {
          color: #79c0ff;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .sequence-link strong {
          overflow-wrap: anywhere;
        }

        .sequence-link.next {
          text-align: right;
        }

        .related-guides {
          margin-top: 24px;
          padding: 20px;
          border: 1px solid #30363d;
          border-radius: 11px;
          background: #161b22;
        }

        .related-guides h2 {
          margin: 0 0 14px;
          font-size: 1.15rem;
        }

        .related-guides > div {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 10px;
        }

        .related-guides a {
          display: grid;
          gap: 5px;
          padding: 12px;
          border: 1px solid #30363d;
          border-radius: 8px;
          color: #f0f6fc;
          text-decoration: none;
        }

        .related-guides a:hover,
        .related-guides a:focus-visible {
          border-color: #58a6ff;
          background: #21262d;
          outline: none;
        }

        .related-guides a span {
          color: #8b949e;
          font-size: 0.85rem;
          line-height: 1.45;
        }

        @media (max-width: 620px) {
          .guide-sequence {
            grid-template-columns: 1fr;
          }

          .sequence-spacer {
            display: none;
          }

          .sequence-link.next {
            text-align: left;
          }
        }
      `}</style>
    </GuideLayout>
  );
}
