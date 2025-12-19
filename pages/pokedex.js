import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import pokedexByRegion, { flatPokemonList } from "../lib/pokedexData"

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

export default function PokedexPage() {
  const { data: session, status } = useSession()
  const [caughtSet, setCaughtSet] = useState(new Set())
  const [statusMessage, setStatusMessage] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

  useEffect(() => {
    if (status !== "authenticated") return

    const fetchData = async () => {
      setIsLoading(true)
      try {
        const response = await fetch("/api/pokedex")
        if (!response.ok) throw new Error("Unable to load your Pokédex")
        const data = await response.json()
        setCaughtSet(new Set(data.dexNumbers))
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [status])

  const toggleCaught = (dexNumber) => {
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

  const caughtCount = caughtSet.size
  const caughtPercentage = Math.round((caughtCount / flatPokemonList.length) * 100)

  const handleSave = async () => {
    setIsSaving(true)
    setStatusMessage("")
    try {
      const response = await fetch("/api/pokedex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexNumbers: Array.from(caughtSet) }),
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

  return (
    <div className="container">
      <div className="card pokedex-hero">
        <div>
          <h1>Pokédex Tracker</h1>
          <p className="muted">Mark Pokémon you’ve obtained by National Dex order, grouped by region.</p>
          <p className="muted">
            Progress: {caughtCount} / {flatPokemonList.length} ({caughtPercentage}%)
          </p>
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

      {pokedexByRegion.map((region) => (
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
