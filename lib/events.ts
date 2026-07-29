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
  tags?: string[];
  description?: string | null;
  campfireUrl?: string | null;
  source?: "feed" | "local";
}

export interface EventsPageData {
  events: PokemonGoEventSummary[];
  fetchedAt: string;
  isStale: boolean;
  warning: string | null;
}

export interface EventTickerItem {
  eventID: string;
  name: string;
  heading: string;
  start: string;
  end: string;
  guideSlug: string | null;
  guideTitle: string | null;
  eventUrl: string | null;
  eventUrlLabel: string | null;
}

export interface RaidBossTickerItem {
  eventID: string;
  category: "five-star" | "shadow" | "mega";
  label: string;
  boss: string;
  end: string;
  link: string | null;
}
