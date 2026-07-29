import { SessionProvider } from "next-auth/react"
import { useRouter } from "next/router"
import "../styles/globals.css"
import Navbar from "../components/Navbar"
import EventTicker from "../components/events/EventTicker"

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter()
  const showEventTicker = !router.pathname.startsWith("/events")

  return (
    <SessionProvider session={session}>
      <Navbar />
      {showEventTicker && <EventTicker />}
      <Component {...pageProps} />
    </SessionProvider>
  )
}
