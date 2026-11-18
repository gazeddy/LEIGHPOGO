import { getEventDestination, type PokemonGoEventSummary } from "./events";

export const SITE_URL = "https://leighpogo.co.uk";
export const SITE_NAME = "LeighPogo";
export const SITE_DESCRIPTION =
  "Pokémon GO events, friend codes and community tools for players in Leigh, Greater Manchester.";

export function absoluteUrl(pathname: string = "/"): string {
  return new URL(pathname, `${SITE_URL}/`).toString();
}

export function cleanCanonicalPath(
  asPath: string,
  fallbackPathname: string = "/",
): string {
  const withoutHash = (asPath || fallbackPathname).split("#", 1)[0];
  const pathname = withoutHash.split("?", 1)[0] || fallbackPathname || "/";

  if (pathname === "/") return pathname;

  return pathname.replace(/\/+$/, "") || "/";
}

export function isIndexablePath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/events" ||
    pathname === "/friend-codes" ||
    pathname.startsWith("/events/")
  );
}

export function stringifyJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "Leigh Pokémon GO Community",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en-GB",
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Leigh Pokémon GO Community",
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/pwa-icon-512.png"),
    areaServed: {
      "@type": "AdministrativeArea",
      name: "Leigh, Greater Manchester",
    },
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function eventJsonLd(event: PokemonGoEventSummary) {
  const campfireUrl = event.campfireUrl?.trim() || null;

  // Only describe events as a local schema.org Event when LeighPogo has a
  // community meetup destination. Generic worldwide in-game events remain
  // normal content pages rather than pretending they have a Leigh venue.
  if (!campfireUrl) return null;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description:
      event.description?.trim() ||
      `Pokémon GO ${event.name} information for players in Leigh, Greater Manchester.`,
    startDate: event.start,
    endDate: event.end,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    url: absoluteUrl(getEventDestination(event)),
    image: event.image ? [event.image] : undefined,
    location: {
      "@type": "Place",
      name: "Leigh Pokémon GO Community",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Leigh",
        addressRegion: "Greater Manchester",
        addressCountry: "GB",
      },
    },
    organizer: {
      "@type": "Organization",
      name: "Leigh Pokémon GO Community",
      url: SITE_URL,
    },
    sameAs: campfireUrl,
  };
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
