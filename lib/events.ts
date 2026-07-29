const EVENTS_FEED_URL =
  "https://raw.githubusercontent.com/Drumstix42/ScrapedDuck/refs/heads/data/events.min.json";

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

function asRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normaliseEvent(value: unknown): PokemonGoEventSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Record<string, unknown>;
  const eventID = asRequiredString(event.eventID);
  const name = asRequiredString(event.name);
  const eventType = asRequiredString(event.eventType);
  const start = asRequiredString(event.start);
  const end = asRequiredString(event.end);

  if (!eventID || !name || !eventType || !start || !end) {
    return null;
  }

  return {
    eventID,
    name,
    eventType,
    heading: asOptionalString(event.heading) ?? eventType,
    link: asOptionalString(event.link),
    image: asOptionalString(event.image),
    start,
    end,
  };
}

function getLondonDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function getUpcomingEvents(
  limit: number = 80,
): Promise<PokemonGoEventSummary[]> {
  const response = await fetch(EVENTS_FEED_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Events feed returned ${response.status} ${response.statusText}`,
    );
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error("Events feed did not return a JSON array");
  }

  const today = getLondonDateKey();

  return payload
    .map(normaliseEvent)
    .filter((event): event is PokemonGoEventSummary => event !== null)
    .filter((event) => event.end.slice(0, 10) >= today)
    .sort((left, right) => {
      const startDifference = left.start.localeCompare(right.start);

      return startDifference !== 0
        ? startDifference
        : left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(1, limit));
}
