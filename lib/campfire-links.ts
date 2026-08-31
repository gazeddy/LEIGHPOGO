import type {
  CampfireMeetupInput,
  EventOverride,
  EventOverrideInput,
} from "./event-overrides";

const CAMPFIRE_SHORT_HOST = "cmpf.re";
const CAMPFIRE_HOST = "campfire.nianticlabs.com";
const MAX_REDIRECTS = 5;
const MEETUP_PATH = /^\/discover\/meetup\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

export interface CampfireDuplicateAssignment {
  eventID: string;
  eventName: string;
  label: string | null;
  url: string;
}

function parseAllowedCampfireUrl(value: string, field: string): URL {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${field} must use https`);
  }

  if (parsed.username || parsed.password || parsed.port) {
    throw new Error(`${field} contains unsupported URL components`);
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== CAMPFIRE_SHORT_HOST && host !== CAMPFIRE_HOST) {
    throw new Error(
      `${field} must use cmpf.re or campfire.nianticlabs.com`,
    );
  }

  return parsed;
}

export function canonicalCampfireMeetupUrl(value: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== CAMPFIRE_HOST ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    return null;
  }

  const match = parsed.pathname.match(MEETUP_PATH);
  if (!match) {
    return null;
  }

  return `https://${CAMPFIRE_HOST}/discover/meetup/${match[1].toLowerCase()}`;
}

export function campfireMeetupId(value: string): string | null {
  const canonical = canonicalCampfireMeetupUrl(value);
  return canonical ? canonical.slice(canonical.lastIndexOf("/") + 1) : null;
}

export async function resolveCampfireMeetupUrl(
  value: string,
  fetchImpl: typeof fetch = fetch,
  field: string = "Campfire URL",
): Promise<string> {
  let current = parseAllowedCampfireUrl(value.trim(), field);
  const alreadyCanonical = canonicalCampfireMeetupUrl(current.toString());

  if (alreadyCanonical) {
    return alreadyCanonical;
  }

  if (current.hostname.toLowerCase() !== CAMPFIRE_SHORT_HOST) {
    throw new Error(`${field} must point to a Campfire meetup`);
  }

  for (let redirectCount = 0; redirectCount < MAX_REDIRECTS; redirectCount += 1) {
    let response: Response;

    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html,*/*;q=0.1",
          "User-Agent": "LeighPogo Campfire link resolver",
        },
      });
    } catch (error) {
      throw new Error(
        `${field} could not be resolved: ${
          error instanceof Error ? error.message : "network request failed"
        }`,
      );
    }

    if (response.status < 300 || response.status >= 400) {
      throw new Error(`${field} did not redirect to a Campfire meetup`);
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`${field} redirect did not include a destination`);
    }

    const next = parseAllowedCampfireUrl(
      new URL(location, current).toString(),
      `${field} redirect`,
    );
    const canonical = canonicalCampfireMeetupUrl(next.toString());

    if (canonical) {
      return canonical;
    }

    if (next.hostname.toLowerCase() !== CAMPFIRE_SHORT_HOST) {
      throw new Error(`${field} redirected to an invalid Campfire destination`);
    }

    current = next;
  }

  throw new Error(`${field} exceeded the Campfire redirect limit`);
}

async function resolveOptionalCampfireUrl(
  value: string | null | undefined,
  fetchImpl: typeof fetch,
  field: string,
): Promise<string | null | undefined> {
  if (value === null || value === undefined) {
    return value;
  }

  if (!value.trim()) {
    return value;
  }

  return resolveCampfireMeetupUrl(value, fetchImpl, field);
}

export async function canonicaliseEventOverrideCampfireLinks(
  input: EventOverrideInput,
  fetchImpl: typeof fetch = fetch,
): Promise<EventOverrideInput> {
  const campfireUrl = await resolveOptionalCampfireUrl(
    input.campfireUrl,
    fetchImpl,
    "Campfire URL",
  );

  const campfireMeetups = Array.isArray(input.campfireMeetups)
    ? await Promise.all(
        input.campfireMeetups.map(
          async (meetup, index): Promise<CampfireMeetupInput> => ({
            ...meetup,
            url: await resolveCampfireMeetupUrl(
              meetup.url,
              fetchImpl,
              `Campfire meetup ${index + 1} URL`,
            ),
          }),
        ),
      )
    : input.campfireMeetups;

  return {
    ...input,
    campfireUrl,
    campfireMeetups,
  };
}

function assignmentsForOverride(
  override: EventOverride,
): CampfireDuplicateAssignment[] {
  const assignments: CampfireDuplicateAssignment[] = [];

  if (override.campfireUrl && campfireMeetupId(override.campfireUrl)) {
    assignments.push({
      eventID: override.eventID,
      eventName: override.name,
      label: null,
      url: override.campfireUrl,
    });
  }

  for (const meetup of override.campfireMeetups ?? []) {
    if (!campfireMeetupId(meetup.url)) {
      continue;
    }

    assignments.push({
      eventID: override.eventID,
      eventName: override.name,
      label: meetup.label,
      url: meetup.url,
    });
  }

  return assignments;
}

export function findCampfireDuplicateAssignments(
  savedEventID: string,
  overrides: EventOverride[],
): CampfireDuplicateAssignment[][] {
  const byMeetup = new Map<string, CampfireDuplicateAssignment[]>();

  for (const override of overrides) {
    for (const assignment of assignmentsForOverride(override)) {
      const meetupID = campfireMeetupId(assignment.url);
      if (!meetupID) continue;

      const group = byMeetup.get(meetupID) ?? [];
      group.push(assignment);
      byMeetup.set(meetupID, group);
    }
  }

  return Array.from(byMeetup.values()).filter(
    (group) =>
      group.length > 1 &&
      group.some((assignment) => assignment.eventID === savedEventID),
  );
}

export function formatCampfireDuplicateWarning(
  duplicateGroups: CampfireDuplicateAssignment[][],
): string | null {
  if (duplicateGroups.length === 0) {
    return null;
  }

  const descriptions = duplicateGroups.map((group) =>
    group
      .map((assignment) =>
        assignment.label
          ? `${assignment.eventName} (${assignment.label})`
          : assignment.eventName,
      )
      .join(" and "),
  );

  return `Warning: the same Campfire meetup is assigned to ${descriptions.join(
    "; ",
  )}. Check the meetup links before publishing.`;
}
