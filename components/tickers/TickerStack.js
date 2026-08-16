import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import DittoDisguiseTicker from "../events/DittoDisguiseTicker"
import EventTicker from "../events/EventTicker"
import RaidBossTicker from "../events/RaidBossTicker"
import NewGymTicker from "../gyms/NewGymTicker"
import {
  DEFAULT_TICKER_PREFERENCES,
  TICKER_PREFERENCES_EVENT,
  TICKER_TYPES,
  hiddenTickerTypesForPath,
} from "../../lib/tickerPreferences"

export default function TickerStack() {
  const router = useRouter()
  const { status } = useSession()
  const [preferences, setPreferences] = useState(DEFAULT_TICKER_PREFERENCES)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  useEffect(() => {
    if (status === "loading") {
      setPreferencesLoaded(false)
      return
    }

    if (status !== "authenticated") {
      setPreferences({ ...DEFAULT_TICKER_PREFERENCES })
      setPreferencesLoaded(true)
      return
    }

    let cancelled = false

    async function loadPreferences() {
      try {
        const response = await fetch("/api/ticker-preferences", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        })

        if (!response.ok) {
          throw new Error("Unable to load ticker preferences")
        }

        const data = await response.json()
        if (!cancelled) {
          setPreferences({
            ...DEFAULT_TICKER_PREFERENCES,
            ...(data.preferences || {}),
          })
          setPreferencesLoaded(true)
        }
      } catch {
        if (!cancelled) {
          setPreferences({ ...DEFAULT_TICKER_PREFERENCES })
          setPreferencesLoaded(true)
        }
      }
    }

    void loadPreferences()

    return () => {
      cancelled = true
    }
  }, [status])

  useEffect(() => {
    function handlePreferenceUpdate(event) {
      if (!event?.detail || typeof event.detail !== "object") return
      setPreferences((current) => ({ ...current, ...event.detail }))
      setPreferencesLoaded(true)
    }

    window.addEventListener(TICKER_PREFERENCES_EVENT, handlePreferenceUpdate)
    return () => {
      window.removeEventListener(TICKER_PREFERENCES_EVENT, handlePreferenceUpdate)
    }
  }, [])

  const hiddenTickers = useMemo(
    () => hiddenTickerTypesForPath(router.pathname),
    [router.pathname],
  )

  if (!preferencesLoaded) {
    return null
  }

  return (
    <>
      {preferences[TICKER_TYPES.EVENTS] &&
        !hiddenTickers.has(TICKER_TYPES.EVENTS) && <EventTicker />}
      {preferences[TICKER_TYPES.RAID_BOSS] &&
        !hiddenTickers.has(TICKER_TYPES.RAID_BOSS) && <RaidBossTicker />}
      {preferences[TICKER_TYPES.DITTO] && <DittoDisguiseTicker />}
      {preferences[TICKER_TYPES.NEW_GYMS] &&
        !hiddenTickers.has(TICKER_TYPES.NEW_GYMS) && <NewGymTicker />}
    </>
  )
}
