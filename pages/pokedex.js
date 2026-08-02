import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import pokedexByRegion from "../lib/pokedexData"

const buildSpriteUrl = ({ dexNumber }) =>
  `https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS/pokemon/${dexNumber.toString()}.png`

function PokedexRegion({ region, caughtSet, onToggle }) {
  const [isOpen, setIsOpen] = useState(true)
  const caughtCount = useMemo(
    () => region.pokemon.filter((pokemon) => caughtSet.has(pokemon.dexNumber)).length,
    [region.pokemon, caughtSet]
  )

  return (
    <div className="card pokedex-region">
      <button
        type="button"
        className="region-header"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div>
          <h2>{region.region}</h2>
          <p className="muted region-count">
            {caughtCount}:{region.pokemon.length} caught
          </p>
        </div>
        <div className="region-meta">
          <p className="muted">
            #{region.pokemon[0].dexNumber} - #{region.pokemon[region.pokemon.length - 1].dexNumber}
          </p>
          <span className={`chevron ${isOpen ? "open" : ""}`} aria-hidden="true">
            ▾
          </span>
        </div>
      </button>
      {isOpen && (
        <div className="pokedex-grid">
          {region.pokemon.map((pokemon) => {
            const checked = caughtSet.has(pokemon.dexNumber)
            return (
              <label key={pokemon.dexNumber} className={`pokedex-item ${checked ? "caught" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(pokemon.dexNumber)}
                />
                <img
                  src={buildSpriteUrl(pokemon)}
                  alt={pokemon.name}
                  className="pokemon-sprite"
                  loading="lazy"
                />
                <div className="pokemon-info">
                  <span className="dex-number">#{pokemon.dexNumber.toString().padStart(3, "0")}</span>
                  <span className="pokemon-name">{pokemon.name}</span>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PokedexPage({
  releasedDexNumbers = [],
  releaseDataStale = false,
  releaseDataError = "",
}) {
  const { data: session, status } = useSession()
  const [caughtSet, setCaughtSet] = useState(new Set())
  const [statusMessage, setStatusMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

  const releasedSet = useMemo(
    () => new Set(releasedDexNumbers.map((dexNumber) => Number(dexNumber))),
    [releasedDexNumbers]
  )

  const availablePokedex = useMemo(
    () =>
      pokedexByRegion
        .map((region) => ({
          ...region,
          pokemon: region.pokemon.filter((pokemon) => releasedSet.has(pokemon.dexNumber)),
        }))
        .filter((region) => region.pokemon.length > 0),
    [releasedSet]
  )

  const availablePokemonList = useMemo(
    () => availablePokedex.flatMap((region) => region.pokemon),
    [availablePokedex]
  )

  useEffect(() => {
    if (status !== "authenticated") return

    const fetchData = async () => {
      setIsLoading(true)
      try {
        const response = await fetch("/api/pokedex")
        if (!response.ok) throw new Error("Unable to load your Pokédex")
        const data = await response.json()
        setCaughtSet(
          new Set(data.dexNumbers.filter((dexNumber) => releasedSet.has(Number(dexNumber))))
        )
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [releasedSet, status])

  const toggleCaught = (dexNumber) => {
    if (!releasedSet.has(dexNumber)) return

    setCaughtSet((prev) => {
      const next = new Set(prev)
      if (next.has(dexNumber)) {
        next.delete(dexNumber)
      } else {
        next.add(dexNumber)
      }
      return next
    })
  }

  const caughtCount = useMemo(
    () => Array.from(caughtSet).filter((dexNumber) => releasedSet.has(dexNumber)).length,
    [caughtSet, releasedSet]
  )
  const caughtPercentage = availablePokemonList.length
    ? Math.round((caughtCount / availablePokemonList.length) * 100)
    : 0

  const handleSave = async () => {
    setIsSaving(true)
    setStatusMessage("")
    try {
      const releasedCaughtDexNumbers = Array.from(caughtSet).filter((dexNumber) =>
        releasedSet.has(dexNumber)
      )
      const response = await fetch("/api/pokedex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexNumbers: releasedCaughtDexNumbers }),
      })

      if (!response.ok) throw new Error("Failed to save your Pokédex.")
      const data = await response.json()
      setCaughtSet(new Set(data.dexNumbers))
      setLastSaved(new Date())
      setStatusMessage("Pokédex saved successfully!")
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (status === "loading") {
    return <div className="container"><p>Loading session…</p></div>
  }

  if (!session) {
    return (
      <div className="container">
        <div className="card">
          <h1>Pokédex Tracker</h1>
          <p className="muted">Please sign in to track your progress.</p>
        </div>
      </div>
    )
  }

  if (!availablePokemonList.length) {
    return (
      <div className="container">
        <div className="card">
          <h1>Pokédex Tracker</h1>
          <p className="status-text">
            {releaseDataError || "The released Pokémon list is temporarily unavailable."}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card pokedex-hero">
        <div>
          <h1>Pokédex Tracker</h1>
          <p className="muted">Mark Pokémon you’ve obtained by National Dex order, grouped by region.</p>
          <p className="muted">
            Progress: {caughtCount} / {availablePokemonList.length} ({caughtPercentage}%)
          </p>
          {releaseDataStale && (
            <p className="muted">Using the last cached release list while PogoAPI is unavailable.</p>
          )}
          {lastSaved && (
            <p className="muted">Last saved: {lastSaved.toLocaleString()}</p>
          )}
        </div>
        <div className="pokedex-actions">
          <button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? "Saving…" : "Save progress"}
          </button>
          {statusMessage && <p className="status-text">{statusMessage}</p>}
        </div>
      </div>

      {isLoading && <p className="muted">Loading your saved Pokédex…</p>}

      {availablePokedex.map((region) => (
        <PokedexRegion
          key={region.region}
          region={region}
          caughtSet={caughtSet}
          onToggle={toggleCaught}
        />
      ))}
    </div>
  )
}

export async function getServerSideProps() {
  try {
    const { getReleasedPokemonData } = require("../lib/releasedPokemonCache")
    const releasedPokemonData = await getReleasedPokemonData()

    return {
      props: {
        releasedDexNumbers: releasedPokemonData.dexNumbers,
        releaseDataStale: releasedPokemonData.stale,
        releaseDataError: "",
      },
    }
  } catch (error) {
    console.error("Unable to load the released Pokémon list", error)

    return {
      props: {
        releasedDexNumbers: [],
        releaseDataStale: false,
        releaseDataError: "The released Pokémon list could not be loaded. Please try again shortly.",
      },
    }
  }
}
