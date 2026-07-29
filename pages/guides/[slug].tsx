import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from "next";
import type { ParsedUrlQuery } from "querystring";
import GuideLayout from "../../components/guides/GuideLayout";
import MarkdownContent from "../../components/guides/MarkdownContent";
import {
  getGuideBySlug,
  getGuideSlugs,
  type Guide,
} from "../../lib/guides";

interface GuidePageProps {
  guide: Guide;
}

interface GuidePageParams extends ParsedUrlQuery {
  slug: string;
}

export const getStaticPaths: GetStaticPaths<GuidePageParams> = async () => ({
  paths: getGuideSlugs().map((slug) => ({ params: { slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<
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
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <GuideLayout
      title={guide.title}
      description={guide.description}
      date={guide.date}
    >
      <MarkdownContent content={guide.content} />
    </GuideLayout>
  );
}
