const PUBLIC_CARDS = [
  {
    href: "/friend-codes",
    title: "Friend Codes",
    description: "Browse community trainer codes and add your own after logging in.",
    label: "Community",
    tone: "friendCodes",
  },
  {
    href: "/events",
    title: "Events",
    description: "See upcoming Pokémon GO events and local community activity.",
    label: "Public",
    tone: "events",
  },
]

const MEMBER_CARDS = [
  {
    href: "/guides",
    title: "Guides",
    description: "Open community guides, tips and local information for players.",
    label: "Members",
    tone: "guides",
  },
  {
    href: "/gyms",
    title: "Gym Map",
    description: "Find nearby gyms, get directions and help keep the map current.",
    label: "Members",
    tone: "gyms",
  },
]

const getTradeCard = (hasFriendCode) => ({
  href: hasFriendCode ? "/trades" : "/friend-codes",
  title: "Trade Listings",
  description: hasFriendCode
    ? "Browse private Pokémon trade offers from registered community members."
    : "Add your Pokémon GO friend code to unlock private trade listings.",
  label: "Members",
  tone: "trades",
})

const ADMIN_CARDS = [
  {
    href: "/admin",
    title: "Admin Panel",
    description: "Manage users, content, events, gym data and community reports.",
    label: "Admin",
    tone: "admin",
  },
]

export function getHomeCards({
  isLoggedIn = false,
  isAdmin = false,
  hasFriendCode = false,
} = {}) {
  const memberAccess = isLoggedIn || isAdmin

  return [
    ...PUBLIC_CARDS,
    ...(memberAccess ? [...MEMBER_CARDS, getTradeCard(hasFriendCode)] : []),
    ...(isAdmin ? ADMIN_CARDS : []),
  ]
}
