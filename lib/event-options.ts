export interface EventTypeOption {
  value: string;
  label: string;
}

export const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  { value: "community-day", label: "Community Day" },
  { value: "community-day-classic", label: "Community Day Classic" },
  { value: "raid-day", label: "Raid Day" },
  { value: "raid-hour", label: "Raid Hour" },
  { value: "spotlight-hour", label: "Spotlight Hour" },
  { value: "research-day", label: "Research Day" },
  { value: "research", label: "Research event" },
  { value: "hatch-day", label: "Hatch Day" },
  { value: "max-battles", label: "Max Battles" },
  { value: "max-mondays", label: "Max Monday" },
  { value: "go-battle-league", label: "GO Battle League" },
  { value: "pokemon-go-fest", label: "Pokémon GO Fest" },
  { value: "pokemon-go-tour", label: "Pokémon GO Tour" },
  { value: "season", label: "Season" },
  { value: "event", label: "General event" },
  { value: "meetup", label: "Local meetup" },
  { value: "other", label: "Other" },
];

export const EVENT_TAG_SUGGESTIONS = [
  "max",
  "dmax",
  "gmax",
  "raid",
  "shadow",
  "community-day",
  "research",
  "pvp",
  "meetup",
];
