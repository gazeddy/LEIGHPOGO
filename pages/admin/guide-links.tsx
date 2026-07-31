import type { GetServerSideProps } from "next";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(
    context.req,
    context.res,
    authOptions as NextAuthOptions,
  );

  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return {
      redirect: { destination: "/login", permanent: false },
    };
  }

  const slug =
    typeof context.query.slug === "string" ? context.query.slug : "";

  if (slug) {
    return {
      redirect: {
        destination: `/admin/content?guide=${encodeURIComponent(slug)}`,
        permanent: false,
      },
    };
  }

  return {
    redirect: { destination: "/admin/content", permanent: false },
  };
};

export default function LegacyGuideLinksRedirect() {
  return null;
}
