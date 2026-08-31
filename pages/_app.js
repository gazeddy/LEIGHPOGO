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
import TickerStack from "../components/tickers/TickerStack"
import PokedexCatalogFetchGuard from "../components/PokedexCatalogFetchGuard"
import PwaBootstrap from "../components/PwaBootstrap"

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter()
  const showPokemonRegionalAdmin = router.pathname === "/admin/pokedex"
  const privacyGate = router.pathname === "/privacy/accept"

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
        <link rel="icon" href="/pwa-icon-192.png" type="image/png" sizes="192x192" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </Head>
      {!privacyGate && <PwaBootstrap />}
      {!privacyGate && <PokedexCatalogFetchGuard />}
      {!privacyGate && <Navbar />}
      {!privacyGate && <TickerStack />}
      <Component {...pageProps} />
      {!privacyGate && showPokemonRegionalAdmin && <PokemonRegionalAdmin />}
      <footer className="site-footer">
        <Link href="/privacy">Privacy Policy</Link>
      </footer>
    </SessionProvider>
  )
}
