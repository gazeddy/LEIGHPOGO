export const EVENT_DATA_CREDITS = {
  leekDuckUrl: "https://leekduck.com/",
  scrapedDuckUrl: "https://github.com/bigfoott/ScrapedDuck",
};

export interface PokemonGoEventSummary {
  eventID: string;
  name: string;
  eventType: string;
  heading: string;
  link: string | null;
  image: string | null;
  start: string;
  end: string;
}

export interface EventsPageData {
  events: PokemonGoEventSummary[];
  fetchedAt: string;
  isStale: boolean;
  warning: string | null;
}

export interface GuidedEventTickerItem {
  eventID: string;
  name: string;
  heading: string;
  start: string;
  end: string;
  guideSlug: string;
  guideTitle: string;
}
