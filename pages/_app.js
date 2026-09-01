import Head from "next/head"
import Link from "next/link"
import { SessionProvider } from "next-auth/react"
import { useRouter } from "next/router"
import "leaflet/dist/leaflet.css"
import "../styles/globals.css"
import "../styles/navbar.css"
import "../styles/app-tools.css"
import "../styles/tickers.css"
import "../styles/gyms.css"
import "../styles/gym-map-layering.css"
import "../styles/trades.css"
import "../styles/wanted-trades.css"
import "../styles/notifications.css"
import "../styles/pokedex-selection.css"
import "../styles/pwa.css"
import "../styles/privacy.css"
import Navbar from "../components/Navbar"
import PokemonRegionalAdmin from "../components/admin/PokemonRegionalAdmin"
import PushPermissionPrompt from "../components/PushPermissionPrompt"
import TickerStack from "../components/tickers/TickerStack"
import PokedexCatalogFetchGuard from "../components/PokedexCatalogFetchGuard"
import PwaBootstrap from "../components/PwaBootstrap"
import { getEventDestination } from "../lib/events"
import {
  SITE_DESCRIPTION,
  absoluteUrl,
  cleanCanonicalPath,
  isIndexablePath,
  organizationJsonLd,
  stringifyJsonLd,
  websiteJsonLd,
} from "../lib/seo"

const PAGE_TITLES = {
  "/": "Pokémon GO Leigh, Greater Manchester | LeighPogo",
  "/account": "Account | LeighPogo",
  "/admin": "Admin | LeighPogo",
  "/entries": "Friend Codes | LeighPogo",
  "/events": "Pokémon GO Events in Leigh | LeighPogo",
  "/friend-codes": "Pokémon GO Friend Codes in Leigh | LeighPogo",
  "/gyms": "Pokémon GO Gym Map – Leigh | LeighPogo",
  "/login": "Sign In | LeighPogo",
  "/notifications": "Notifications | LeighPogo",
  "/pokedex": "Pokédex | LeighPogo",
  "/pokedex-import": "Pokédex Import | LeighPogo",
  "/privacy": "Privacy Policy | LeighPogo",
  "/privacy/accept": "Privacy Policy | LeighPogo",
  "/register": "Sign Up | LeighPogo",
  "/raid-bosses": "Pokémon GO Raid Bosses | LeighPogo",
  "/trades": "Pokémon GO Trades | LeighPogo",
  "/trades/wanted": "Wanted Pokémon GO Trades | LeighPogo",
}

const PAGE_DESCRIPTIONS = {
  "/": SITE_DESCRIPTION,
  "/events": "Current and upcoming Pokémon GO events, bonuses, spawns and raids for players in Leigh, Greater Manchester.",
  "/friend-codes": "Browse Pokémon GO friend codes from trainers in Leigh, Greater Manchester, and add your own code to the LeighPogo community list.",
}

const TITLE_WORDS = {
  api: "API",
  cp: "CP",
  pogo: "PoGo",
  pokedex: "Pokédex",
  pokemon: "Pokémon",
  pwa: "PWA",
}

const routeTitle = (pathname) => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]

  const segment = pathname
    .split("/")
    .filter((part) => part && !part.startsWith("["))
    .at(-1)

  if (!segment) return "LeighPogo"

  const label = segment
    .split("-")
    .map((word) => TITLE_WORDS[word.toLowerCase()] || `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ")

  return `${label} | LeighPogo`
}

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter()
  const showPokemonRegionalAdmin = router.pathname === "/admin/pokedex"
  const privacyGate = router.pathname === "/privacy/accept"
  const pageTitle = routeTitle(router.pathname)
  const canonicalPath = cleanCanonicalPath(router.asPath, router.pathname)
  const canonicalUrl = absoluteUrl(canonicalPath)
  const indexable = isIndexablePath(router.pathname)
  const pageDescription = PAGE_DESCRIPTIONS[router.pathname]
  const pageOwnsDescription =
    router.pathname === "/" ||
    router.pathname === "/events" ||
    router.pathname === "/friend-codes" ||
    router.pathname.startsWith("/events/")
  const eventLinks =
    router.pathname === "/events" && Array.isArray(pageProps.events)
      ? pageProps.events.slice(0, 12)
      : []

  return (
    <SessionProvider session={session}>
      <Head>
        <title>{pageTitle}</title>
        {!pageOwnsDescription && pageDescription && (
          <meta name="description" content={pageDescription} />
        )}
        <meta
          name="robots"
          content={indexable ? "index,follow" : "noindex,nofollow"}
        />
        <link rel="canonical" href={canonicalUrl} key="canonical" />
        <meta name="theme-color" content="#0d1117" />
        <meta name="application-name" content="LEIGHPOGO" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="LEIGHPOGO" />
        <meta property="og:site_name" content="LeighPogo" />
        <meta property="og:url" content={canonicalUrl} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/pwa-icon-192.png" type="image/png" sizes="192x192" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(websiteJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(organizationJsonLd()) }}
        />
      </Head>
      {!privacyGate && <PwaBootstrap />}
      {!privacyGate && <PokedexCatalogFetchGuard />}
      {!privacyGate && <Navbar />}
      {!privacyGate && <TickerStack />}
      {!privacyGate && <PushPermissionPrompt />}
      <Component {...pageProps} />
      {eventLinks.length > 0 && (
        <nav className="seo-event-links container" aria-label="Upcoming Pokémon GO event pages">
          <strong>Upcoming Pokémon GO event pages</strong>
          <div>
            {eventLinks.map((event) => (
              <Link key={event.eventID} href={getEventDestination(event)}>
                {event.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
      {!privacyGate && showPokemonRegionalAdmin && <PokemonRegionalAdmin />}
      <footer className="site-footer">
        <Link href="/privacy">Privacy Policy</Link>
      </footer>
      <style jsx global>{`
        .seo-event-links {
          margin-top: 8px;
          margin-bottom: 24px;
          padding-top: 18px;
          border-top: 1px solid #30363d;
          color: #8b949e;
          font-size: 0.82rem;
        }

        .seo-event-links > div {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 12px;
          margin-top: 10px;
        }

        .seo-event-links a {
          color: #79c0ff;
        }
      `}</style>
    </SessionProvider>
  )
}
