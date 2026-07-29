import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import GuideLayout from "../../components/guides/GuideLayout";
import MarkdownContent from "../../components/guides/MarkdownContent";
import { getGuideBySlug, type Guide } from "../../lib/guides";

interface GuidePageProps {
  guide: Guide;
}

interface GuidePageParams extends ParsedUrlQuery {
  slug: string;
}

export const getServerSideProps: GetServerSideProps<
  GuidePageProps,
  GuidePageParams
> = async ({ params }) => {
  const guide = params?.slug ? getGuideBySlug(params.slug) : null;

  if (!guide) {
    return { notFound: true };
  }

  return {
    props: { guide },
  };
};

export default function GuidePage({
  guide,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <GuideLayout
      title={guide.title}
      description={guide.description}
      date={guide.date}
    >
      {guide.tags && guide.tags.length > 0 && (
        <div className="guide-page-tags" aria-label="Guide tags">
          {guide.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
          <style jsx>{`
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
          `}</style>
        </div>
      )}
      <MarkdownContent content={guide.content} />
    </GuideLayout>
  );
}
