export const TICKER_TYPES = {
  EVENTS: "EVENTS",
  RAID_BOSS: "RAID_BOSS",
  DITTO: "DITTO",
  NEW_GYMS: "NEW_GYMS",
}

export const TICKER_OPTIONS = [
  {
    key: TICKER_TYPES.EVENTS,
    label: "Event updates",
    description: "Upcoming and active Pokémon GO events. Hidden automatically on the Events page.",
  },
  {
    key: TICKER_TYPES.RAID_BOSS,
    label: "Raid boss updates",
    description: "Current and upcoming raid boss rotations. Hidden automatically on the Raid Bosses page.",
  },
  {
    key: TICKER_TYPES.DITTO,
    label: "Ditto disguises",
    description: "Current Pokémon that can be Ditto in disguise.",
  },
  {
    key: TICKER_TYPES.NEW_GYMS,
    label: "New gyms",
    description: "Gyms added during the last seven days. Hidden automatically on the Gym Map.",
  },
]

export const TICKER_TYPE_VALUES = TICKER_OPTIONS.map((option) => option.key)

export const DEFAULT_TICKER_PREFERENCES = TICKER_TYPE_VALUES.reduce(
  (preferences, tickerType) => {
    preferences[tickerType] = true
    return preferences
  },
  {},
)

export const TICKER_PREFERENCES_EVENT = "leighpogo:ticker-preferences"

export function normalizeTickerPreferences(rows = []) {
  const preferences = { ...DEFAULT_TICKER_PREFERENCES }

  for (const row of rows) {
    if (
      TICKER_TYPE_VALUES.includes(row?.tickerType) &&
      typeof row?.enabled === "boolean"
    ) {
      preferences[row.tickerType] = row.enabled
    }
  }

  return preferences
}

export function hiddenTickerTypesForPath(pathname = "") {
  const hidden = new Set()

  if (pathname.startsWith("/events")) {
    hidden.add(TICKER_TYPES.EVENTS)
  }

  if (pathname.startsWith("/tools/raids")) {
    hidden.add(TICKER_TYPES.RAID_BOSS)
  }

  if (pathname.startsWith("/gyms")) {
    hidden.add(TICKER_TYPES.NEW_GYMS)
  }

  return hidden
}
