import type { GetServerSideProps } from "next";
import { shouldShowOnEventsPage } from "../lib/event-selection";
import { getEventDestination } from "../lib/events";
import { getEventsPageData } from "../lib/events-server";
import { absoluteUrl, xmlEscape } from "../lib/seo";

const STATIC_PATHS = ["/", "/events", "/friend-codes"];

function urlEntry(path: string, lastModified?: string | null): string {
  const lastmod = lastModified
    ? `\n    <lastmod>${xmlEscape(lastModified)}</lastmod>`
    : "";

  return `  <url>\n    <loc>${xmlEscape(absoluteUrl(path))}</loc>${lastmod}\n  </url>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  let eventPaths: string[] = [];
  let fetchedAt: string | null = null;

  try {
    const data = await getEventsPageData(200);
    fetchedAt = data.fetchedAt;
    eventPaths = data.events
      .filter(shouldShowOnEventsPage)
      .map((event) => getEventDestination(event));
  } catch {
    // A temporary upstream feed failure must not take the sitemap itself down.
  }

  const paths = Array.from(new Set([...STATIC_PATHS, ...eventPaths]));
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((path) =>
      urlEntry(path, path.startsWith("/events/") ? fetchedAt : null),
    ),
    "</urlset>",
    "",
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.write(xml);
  res.end();

  return { props: {} };
};

export default function SitemapXml() {
  return null;
}
