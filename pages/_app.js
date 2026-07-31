import { SessionProvider } from "next-auth/react"
import "../styles/globals.css"
import "../styles/trades.css"
import Navbar from "../components/Navbar"

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Navbar />
      <Component {...pageProps} />
    </SessionProvider>
  )
}
