import prisma from "./prisma"

export const PUSH_PREFERENCE_KEYS = {
  RAIDS: "PUSH_RAIDS",
  TRADES: "PUSH_TRADES",
}

export const PUSH_PREFERENCE_OPTIONS = [
  {
    key: PUSH_PREFERENCE_KEYS.RAIDS,
    label: "Raid alerts",
    description: "Raid Hour, Raid Day and event raid push notifications.",
  },
  {
    key: PUSH_PREFERENCE_KEYS.TRADES,
    label: "Trade alerts",
    description: "Wanted-trade and listing-match push notifications.",
  },
]

export const PUSH_PREFERENCE_VALUES = PUSH_PREFERENCE_OPTIONS.map((option) => option.key)

export const DEFAULT_PUSH_PREFERENCES = PUSH_PREFERENCE_VALUES.reduce(
  (preferences, key) => {
    preferences[key] = true
    return preferences
  },
  {},
)

export function normalizePushPreferences(rows = []) {
  const preferences = { ...DEFAULT_PUSH_PREFERENCES }

  for (const row of rows) {
    if (
      PUSH_PREFERENCE_VALUES.includes(row?.tickerType) &&
      typeof row?.enabled === "boolean"
    ) {
      preferences[row.tickerType] = row.enabled
    }
  }

  return preferences
}

export async function pushPreferenceEnabled(ownerId, key) {
  const numericOwnerId = Number(ownerId)
  if (!Number.isInteger(numericOwnerId) || !PUSH_PREFERENCE_VALUES.includes(key)) {
    return true
  }

  const row = await prisma.userTickerPreference.findUnique({
    where: {
      ownerId_tickerType: {
        ownerId: numericOwnerId,
        tickerType: key,
      },
    },
    select: { enabled: true },
  })

  return row?.enabled !== false
}

export async function enabledPushOwnerIds(ownerIds, key) {
  const uniqueOwnerIds = Array.from(
    new Set(ownerIds.map(Number).filter((ownerId) => Number.isInteger(ownerId))),
  )

  if (uniqueOwnerIds.length === 0 || !PUSH_PREFERENCE_VALUES.includes(key)) {
    return new Set(uniqueOwnerIds)
  }

  const disabledRows = await prisma.userTickerPreference.findMany({
    where: {
      ownerId: { in: uniqueOwnerIds },
      tickerType: key,
      enabled: false,
    },
    select: { ownerId: true },
  })

  const disabled = new Set(disabledRows.map((row) => row.ownerId))
  return new Set(uniqueOwnerIds.filter((ownerId) => !disabled.has(ownerId)))
}
