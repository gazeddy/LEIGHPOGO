import { SessionProvider } from "next-auth/react"
import { useRouter } from "next/router"
import "../styles/globals.css"
import "../styles/navbar.css"
import "../styles/tickers.css"
import Navbar from "../components/Navbar"
import EventTicker from "../components/events/EventTicker"
import RaidBossTicker from "../components/events/RaidBossTicker"

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter()
  const showEventTicker = !router.pathname.startsWith("/events")

  return (
    <SessionProvider session={session}>
      <Navbar />
      {showEventTicker && <EventTicker />}
      <RaidBossTicker />
      <Component {...pageProps} />
    </SessionProvider>
  )
}
