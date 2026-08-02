import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import pokedexByRegion from "../lib/pokedexData"
import { PokemonEntry, PokedexStyles } from "../components/PokedexEntry"

function PokedexRegion({
  region,
  visiblePokemon,
  caughtSet,
  onToggle,
  pokemonInfo,
  expandedDex,
  onExpand,
  onNavigate,
  focusedDex,
  infoLoading,
  infoError,
  releasedSet,
}) {
  const [open, setOpen] = useState(true)
  const caughtCount = useMemo(
    () => region.pokemon.filter((pokemon) => caughtSet.has(pokemon.dexNumber)).length,
    [caughtSet, region.pokemon]
  )

  useEffect(() => {
    if (focusedDex && region.pokemon.some((pokemon) => pokemon.dexNumber === focusedDex)) {
      setOpen(true)
    }
  }, [focusedDex, region.pokemon])

  return (
    <div className="card pokedex-region">
      <button type="button" className="pokedex-region-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div>
          <h2>{region.region}</h2>
          <p className="muted">
            {caughtCount}/{region.pokemon.length} caught
            {visiblePokemon.length !== region.pokemon.length && ` · ${visiblePokemon.length} shown`}
          </p>
        </div>
        <span>
          <p className="muted">#{region.pokemon[0].dexNumber} – #{region.pokemon[region.pokemon.length - 1].dexNumber}</p>
          <b className={open ? "open" : ""}>▾</b>
        </span>
      </button>

      {open && (
        <div className="pokedex-grid">
          {visiblePokemon.map((pokemon) => (
            <PokemonEntry
              key={pokemon.dexNumber}
              pokemon={pokemon}
              checked={caughtSet.has(pokemon.dexNumber)}
              onToggle={onToggle}
              details={pokemonInfo?.[pokemon.dexNumber]}
              expanded={expandedDex === pokemon.dexNumber}
              onExpand={() => onExpand(pokemon.dexNumber)}
              onNavigate={onNavigate}
              infoLoading={infoLoading}
              infoError={infoError}
              releasedSet={releasedSet}
            />
          ))}
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
  const [pokedexInfo, setPokedexInfo] = useState(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [infoError, setInfoError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("All")
  const [caughtFilter, setCaughtFilter] = useState("all")
  const [expandedDex, setExpandedDex] = useState(null)
  const [focusedDex, setFocusedDex] = useState(null)

  const releasedSet = useMemo(
    () => new Set(releasedDexNumbers.map((dexNumber) => Number(dexNumber))),
    [releasedDexNumbers]
  )

  const availablePokedex = useMemo(
    () => pokedexByRegion
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

    async function fetchCaughtData() {
      setIsLoading(true)
      try {
        const response = await fetch("/api/pokedex")
        if (!response.ok) throw new Error("Unable to load your Pokédex")
        const data = await response.json()
        setCaughtSet(new Set(data.dexNumbers.filter((dexNumber) => releasedSet.has(Number(dexNumber)))))
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setIsLoading(false)
      }
    }

    async function fetchPokedexInfo() {
      setInfoLoading(true)
      setInfoError("")
      try {
        const response = await fetch("/api/pokedex-data")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Unable to load Pokédex information")
        setPokedexInfo(data)
      } catch (error) {
        setInfoError(error.message)
      } finally {
        setInfoLoading(false)
      }
    }

    fetchCaughtData()
    fetchPokedexInfo()
  }, [releasedSet, status])

  const toggleCaught = (dexNumber) => {
    if (!releasedSet.has(dexNumber)) return
    setCaughtSet((previous) => {
      const next = new Set(previous)
      next.has(dexNumber) ? next.delete(dexNumber) : next.add(dexNumber)
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

  const filteredRegions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return availablePokedex
      .map((region) => ({
        ...region,
        visiblePokemon: region.pokemon.filter((pokemon) => {
          const details = pokedexInfo?.pokemon?.[pokemon.dexNumber]
          const matchesSearch = !query || pokemon.name.toLowerCase().includes(query) || String(pokemon.dexNumber).includes(query)
          const matchesType = typeFilter === "All" || details?.types?.includes(typeFilter)
          const isCaught = caughtSet.has(pokemon.dexNumber)
          const matchesCaught = caughtFilter === "all" || (caughtFilter === "caught" && isCaught) || (caughtFilter === "missing" && !isCaught)
          return matchesSearch && matchesType && matchesCaught
        }),
      }))
      .filter((region) => region.visiblePokemon.length > 0)
  }, [availablePokedex, caughtFilter, caughtSet, pokedexInfo, searchTerm, typeFilter])

  const visibleCount = useMemo(
    () => filteredRegions.reduce((total, region) => total + region.visiblePokemon.length, 0),
    [filteredRegions]
  )

  async function handleSave() {
    setIsSaving(true)
    setStatusMessage("")
    try {
      const dexNumbers = Array.from(caughtSet).filter((dexNumber) => releasedSet.has(dexNumber))
      const response = await fetch("/api/pokedex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexNumbers }),
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

  function navigateToPokemon(dexNumber) {
    setSearchTerm("")
    setTypeFilter("All")
    setCaughtFilter("all")
    setExpandedDex(dexNumber)
    setFocusedDex(dexNumber)
    window.setTimeout(() => {
      document.getElementById(`pokemon-${dexNumber}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 150)
  }

  if (status === "loading") return <div className="container"><p>Loading session…</p></div>

  if (!session) {
    return <div className="container"><div className="card"><h1>Pokédex</h1><p className="muted">Please sign in to view and track your Pokédex.</p></div></div>
  }

  if (!availablePokemonList.length) {
    return <div className="container"><div className="card"><h1>Pokédex</h1><p className="status-text">{releaseDataError || "The released Pokémon list is temporarily unavailable."}</p></div></div>
  }

  return (
    <div className="container pokedex-page">
      <div className="card pokedex-hero">
        <div>
          <h1>Pokédex</h1>
          <p className="muted">Track your collection and open a Pokémon for typing, matchups, and linked evolution requirements.</p>
          <p className="muted">Progress: {caughtCount} / {availablePokemonList.length} ({caughtPercentage}%)</p>
          {releaseDataStale && <p className="muted">Using the last cached release list while POGOAPI is unavailable.</p>}
          {lastSaved && <p className="muted">Last saved: {lastSaved.toLocaleString()}</p>}
          {pokedexInfo?.refreshedAt && (
            <p className="muted">POGOAPI details refreshed {new Date(pokedexInfo.refreshedAt).toLocaleString()}{pokedexInfo.stale && " · cached copy"}</p>
          )}
        </div>
        <div className="pokedex-actions">
          <button onClick={handleSave} disabled={isSaving || isLoading}>{isSaving ? "Saving…" : "Save progress"}</button>
          {statusMessage && <p className="status-text">{statusMessage}</p>}
        </div>
      </div>

      <div className="card pokedex-toolbar">
        <div className="pokedex-filters">
          <label>Search<input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Name or National Dex number" /></label>
          <label>Type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} disabled={infoLoading || !pokedexInfo}>
            <option value="All">All types</option>
            {pokedexInfo?.types?.map((type) => <option value={type} key={type}>{type}</option>)}
          </select></label>
          <label>Collection<select value={caughtFilter} onChange={(event) => setCaughtFilter(event.target.value)}>
            <option value="all">All Pokémon</option><option value="caught">Caught only</option><option value="missing">Missing only</option>
          </select></label>
        </div>
        <div className="pokedex-filter-summary">
          <span>{visibleCount} Pokémon shown</span>
          {(searchTerm || typeFilter !== "All" || caughtFilter !== "all") && (
            <button type="button" className="pokedex-clear" onClick={() => { setSearchTerm(""); setTypeFilter("All"); setCaughtFilter("all") }}>Clear filters</button>
          )}
        </div>
        {infoLoading && <p className="muted">Loading POGOAPI typing and evolution data…</p>}
        {infoError && <p className="pokedex-error">{infoError}</p>}
      </div>

      {isLoading && <p className="muted">Loading your saved Pokédex…</p>}

      {filteredRegions.map((region) => (
        <PokedexRegion
          key={region.region}
          region={region}
          visiblePokemon={region.visiblePokemon}
          caughtSet={caughtSet}
          onToggle={toggleCaught}
          pokemonInfo={pokedexInfo?.pokemon}
          expandedDex={expandedDex}
          onExpand={(dexNumber) => setExpandedDex((current) => current === dexNumber ? null : dexNumber)}
          onNavigate={navigateToPokemon}
          focusedDex={focusedDex}
          infoLoading={infoLoading}
          infoError={infoError}
          releasedSet={releasedSet}
        />
      ))}

      {!filteredRegions.length && <div className="card pokedex-empty"><h2>No Pokémon found</h2><p className="muted">Try clearing or changing the filters.</p></div>}
      <PokedexStyles />
    </div>
  )
}

export async function getServerSideProps() {
  try {
    const { getReleasedPokemonData } = require("../lib/releasedPokemonCache")
    const releasedPokemonData = await getReleasedPokemonData()
    return { props: { releasedDexNumbers: releasedPokemonData.dexNumbers, releaseDataStale: releasedPokemonData.stale, releaseDataError: "" } }
  } catch (error) {
    console.error("Unable to load the released Pokémon list", error)
    return { props: { releasedDexNumbers: [], releaseDataStale: false, releaseDataError: "The released Pokémon list could not be loaded. Please try again shortly." } }
  }
}
