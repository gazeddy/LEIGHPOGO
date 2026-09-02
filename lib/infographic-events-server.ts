import type { PokemonGoEventSummary } from "./events";
import {
  fetchEventDetailsBySourceLink,
  findEventDetails,
  type EventDetailsEnrichment,
} from "./event-details-server";
import { applyEventOverrides } from "./event-overrides";
import {
  getImportedEventsForAdmin,
  type ImportedEventsAdminData,
} from "./events-server";

export function mergeInfographicEventDetails(
  event: PokemonGoEventSummary,
  detailsBySourceLink: Map<string, EventDetailsEnrichment>,
): PokemonGoEventSummary {
  const details = findEventDetails(detailsBySourceLink, event.link);
  if (!details) return event;

  return {
    ...event,
    description: event.description ?? details.description,
    wildSpawns:
      details.wildSpawns.length > 0 ? details.wildSpawns : event.wildSpawns,
    featuredRaids:
      details.featuredRaids.length > 0
        ? details.featuredRaids
        : event.featuredRaids,
    bonuses: details.bonuses.length > 0 ? details.bonuses : event.bonuses,
  };
}

function combineWarnings(...warnings: Array<string | null>): string | null {
  const present = warnings.map((warning) => warning?.trim()).filter(Boolean);
  return present.length > 0 ? present.join(" ") : null;
}

export async function getInfographicEventsData(
  limit: number = 240,
): Promise<ImportedEventsAdminData> {
  const [base, detailsBySourceLink] = await Promise.all([
    getImportedEventsForAdmin(limit),
    fetchEventDetailsBySourceLink(),
  ]);

  const enriched = base.events.map((event) =>
    mergeInfographicEventDetails(event, detailsBySourceLink),
  );
  const events = await applyEventOverrides(enriched);
  const detailsWarning =
    detailsBySourceLink.size === 0
      ? "Detailed event data could not be loaded; generated infographics may contain limited information."
      : null;

  return {
    ...base,
    events,
    warning: combineWarnings(base.warning, detailsWarning),
  };
}
