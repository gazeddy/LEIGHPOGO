const POKEMON_GO_SCHEME = "pokemongo:"

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

  if (isAndroid() || isAppleMobile()) {
    // Android is confirmed to expose pokemongo: as a browser-launchable deep link.
    // iOS uses the same scheme here so it can be verified on a real iPhone/iPad.
    // Keep navigation directly inside the user's tap for reliable app hand-off.
    window.location.href = POKEMON_GO_SCHEME
    recordPokemonGoLaunch()
    return
  }

  recordPokemonGoLaunch()
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
