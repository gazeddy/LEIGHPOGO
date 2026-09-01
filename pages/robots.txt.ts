import type { GetServerSideProps } from "next";
import { SITE_URL } from "../lib/seo";

const ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /account
Disallow: /admin
Disallow: /entries
Disallow: /guides
Disallow: /gyms
Disallow: /notifications
Disallow: /pokedex
Disallow: /raid-bosses
Disallow: /trades

Sitemap: ${SITE_URL}/sitemap.xml
`;

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.write(ROBOTS);
  res.end();

  return { props: {} };
};

export default function RobotsTxt() {
  return null;
}
