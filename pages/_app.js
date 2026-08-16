import Head from "next/head"
import { SessionProvider } from "next-auth/react"
import { useRouter } from "next/router"
import "leaflet/dist/leaflet.css"
import "../styles/globals.css"
import "../styles/navbar.css"
import "../styles/tickers.css"
import "../styles/gyms.css"
import "../styles/trades.css"
import "../styles/wanted-trades.css"
import "../styles/notifications.css"
import "../styles/pokedex-selection.css"
import "../styles/pwa.css"
import Navbar from "../components/Navbar"
import PokemonRegionalAdmin from "../components/admin/PokemonRegionalAdmin"
import DittoDisguiseTicker from "../components/events/DittoDisguiseTicker"
import EventTicker from "../components/events/EventTicker"
import RaidBossTicker from "../components/events/RaidBossTicker"
import NewGymTicker from "../components/gyms/NewGymTicker"
import PokedexCatalogFetchGuard from "../components/PokedexCatalogFetchGuard"
import PwaBootstrap from "../components/PwaBootstrap"

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter()
  const showEventTicker = !router.pathname.startsWith("/events")
  const showPokemonRegionalAdmin = router.pathname === "/admin/pokedex"

  return (
    <SessionProvider session={session}>
      <Head>
        <meta name="theme-color" content="#0d1117" />
        <meta name="application-name" content="LEIGHPOGO" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="LEIGHPOGO" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/pwa-icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </Head>
      <PwaBootstrap />
      <PokedexCatalogFetchGuard />
      <Navbar />
      {showEventTicker && <EventTicker />}
      <RaidBossTicker />
      <DittoDisguiseTicker />
      <NewGymTicker />
      <Component {...pageProps} />
      {showPokemonRegionalAdmin && <PokemonRegionalAdmin />}
    </SessionProvider>
  )
}
