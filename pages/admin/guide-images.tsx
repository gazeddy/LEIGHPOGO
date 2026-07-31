import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const slug = typeof query.slug === "string" ? query.slug : "";
  const suffix = slug ? `?slug=${encodeURIComponent(slug)}` : "";

  return {
    redirect: {
      destination: `/admin/guide-editor${suffix}`,
      permanent: false,
    },
  };
};

export default function LegacyGuideImagesPage() {
  return null;
}
