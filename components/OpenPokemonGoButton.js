const POKEMON_GO_SCHEME = "pokemongo:"
const APP_STORE_URL = "https://apps.apple.com/gb/app/pok%C3%A9mon-go/id1094591345"

const isAppleMobile = () => {
  if (typeof navigator === "undefined") return false

  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

const isAndroid = () =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent)

const recordPokemonGoLaunch = () => {
  if (typeof window === "undefined") return

  fetch("/api/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "POKEMON_GO_LAUNCHED",
      path: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => {
    // Launching the game should never be blocked by analytics.
  })
}

export const openPokemonGo = () => {
  if (typeof window === "undefined") return

  if (isAndroid()) {
    // Pokémon GO exposes this as a VIEW + BROWSABLE deep link on Android.
    // Keep the navigation directly inside the user's tap so Chromium can
    // hand off to the installed app without falling back to Google Play.
    window.location.href = POKEMON_GO_SCHEME
    recordPokemonGoLaunch()
    return
  }

  recordPokemonGoLaunch()

  if (isAppleMobile()) {
    window.location.href = APP_STORE_URL
    return
  }

  window.open("https://pokemongolive.com/", "_blank", "noopener,noreferrer")
}

export default function OpenPokemonGoButton({ className = "" }) {
  return (
    <button
      type="button"
      className={`pokemon-go-launch-button ${className}`.trim()}
      onClick={openPokemonGo}
    >
      Open Pokémon GO
    </button>
  )
}
