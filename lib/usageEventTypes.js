export const USAGE_EVENT_TYPES = Object.freeze([
  "GYM_MAP_OPENED",
  "FRIEND_CODE_COPIED",
  "TRADE_CREATED",
  "WANTED_TRADE_CREATED",
  "POKEMON_GO_LAUNCHED",
  "PUSH_ENABLED",
  "PUSH_DISABLED",
])

export const USAGE_EVENT_LABELS = Object.freeze({
  GYM_MAP_OPENED: "Gym Map opened",
  FRIEND_CODE_COPIED: "Friend code copied",
  TRADE_CREATED: "Trade listing created",
  WANTED_TRADE_CREATED: "Wanted trade created",
  POKEMON_GO_LAUNCHED: "Pokémon GO launch button used",
  PUSH_ENABLED: "Push notifications enabled",
  PUSH_DISABLED: "Push notifications disabled",
})

export const isUsageEventType = (value) =>
  USAGE_EVENT_TYPES.includes(String(value || "").trim().toUpperCase())
