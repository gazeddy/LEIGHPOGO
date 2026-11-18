import type { PokemonGoEventPokemon } from "./events";

const EVENT_DETAILS_FEED_URL =
  "https://raw.githubusercontent.com/zhenga8533/leak-duck/data/events.json";

export interface EventDetailsEnrichment {
  description: string | null;
  wildSpawns: PokemonGoEventPokemon[];
  featuredRaids: PokemonGoEventPokemon[];
  bonuses: string[];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sourceLinkKey(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase() || null;
  }
}

function normalisePokemon(value: unknown): PokemonGoEventPokemon | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const name = optionalString(candidate.name);

  if (!name) return null;

  const shinyValue = candidate.shiny_available ?? candidate.canBeShiny;

  return {
    name,
    image:
      optionalString(candidate.asset_url) ?? optionalString(candidate.image),
    canBeShiny: typeof shinyValue === "boolean" ? shinyValue : null,
  };
}

function pokemonList(value: unknown): PokemonGoEventPokemon[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: PokemonGoEventPokemon[] = [];

  for (const rawPokemon of value) {
    const pokemon = normalisePokemon(rawPokemon);
    if (!pokemon) continue;

    const key = pokemon.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pokemon);
  }

  return result;
}

function bonusText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  return (
    optionalString(candidate.text) ??
    optionalString(candidate.bonus) ??
    optionalString(candidate.description) ??
    optionalString(candidate.label)
  );
}

function bonusList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(value.map(bonusText).filter((item): item is string => item !== null)),
  );
}

function normaliseDetailsRecord(value: unknown): {
  sourceLink: string;
  details: EventDetailsEnrichment;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const sourceLink = sourceLinkKey(optionalString(candidate.article_url));
  if (!sourceLink) return null;

  const rawDetails =
    candidate.details &&
    typeof candidate.details === "object" &&
    !Array.isArray(candidate.details)
      ? (candidate.details as Record<string, unknown>)
      : {};

  return {
    sourceLink,
    details: {
      description: optionalString(candidate.description),
      wildSpawns: pokemonList(rawDetails.spawns),
      featuredRaids: pokemonList(rawDetails.raids),
      bonuses: bonusList(rawDetails.bonuses),
    },
  };
}

export function parseEventDetailsPayload(
  payload: unknown,
): Map<string, EventDetailsEnrichment> {
  const result = new Map<string, EventDetailsEnrichment>();

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return result;
  }

  for (const categoryEvents of Object.values(
    payload as Record<string, unknown>,
  )) {
    if (!Array.isArray(categoryEvents)) continue;

    for (const rawEvent of categoryEvents) {
      const event = normaliseDetailsRecord(rawEvent);
      if (event) result.set(event.sourceLink, event.details);
    }
  }

  return result;
}

export function findEventDetails(
  bySourceLink: Map<string, EventDetailsEnrichment>,
  sourceLink: string | null,
): EventDetailsEnrichment | null {
  const key = sourceLinkKey(sourceLink);
  return key ? bySourceLink.get(key) ?? null : null;
}

export async function fetchEventDetailsBySourceLink(): Promise<
  Map<string, EventDetailsEnrichment>
> {
  try {
    const response = await fetch(EVENT_DETAILS_FEED_URL, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return new Map();
    }

    return parseEventDetailsPayload(await response.json());
  } catch {
    // Enrichment must never make the primary events feed unavailable.
    return new Map();
  }
}
