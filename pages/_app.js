import { SessionProvider } from "next-auth/react"
import { useRouter } from "next/router"
import "leaflet/dist/leaflet.css"
import "../styles/globals.css"
import "../styles/navbar.css"
import "../styles/tickers.css"
import "../styles/gyms.css"
import "../styles/trades.css"
import "../styles/wanted-trades.css"
import Navbar from "../components/Navbar"
import DittoDisguiseTicker from "../components/events/DittoDisguiseTicker"
import EventTicker from "../components/events/EventTicker"
import RaidBossTicker from "../components/events/RaidBossTicker"
import NewGymTicker from "../components/gyms/NewGymTicker"

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter()
  const showEventTicker = !router.pathname.startsWith("/events")

  return (
    <SessionProvider session={session}>
      <Navbar />
      {showEventTicker && <EventTicker />}
      <RaidBossTicker />
      <DittoDisguiseTicker />
      <NewGymTicker />
      <Component {...pageProps} />
    </SessionProvider>
  )
}
