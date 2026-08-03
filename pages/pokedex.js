import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"

const buildSpriteUrl = (dexNumber) =>
  `https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS/pokemon/${dexNumber}.png`

const TYPE_COLOURS = {
  Bug: "#729f3f",
  Dark: "#4f3a34",
  Dragon: "#5368c4",
  Electric: "#b99400",
  Fairy: "#b94f91",
  Fighting: "#a9422f",
  Fire: "#c9502e",
  Flying: "#607fae",
  Ghost: "#5d4d80",
  Grass: "#468c3f",
  Ground: "#9e7938",
  Ice: "#4f9fad",
  Normal: "#70767b",
  Poison: "#7f488e",
  Psychic: "#bd496c",
  Rock: "#887734",
  Steel: "#58727d",
  Water: "#376daa",
}

function PokedexStyles() {
  return <style jsx global>{`
    .pokedex-page { max-width: 1200px; }
    .pokemon-card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-top: 18px; }
    .pokemon-dex-card { display: grid; align-content: start; gap: 12px; padding: 14px; border: 1px solid #484f58; border-radius: 10px; background: #30363d; scroll-margin-top: 88px; }
    .pokemon-dex-card.selected { animation: pokemon-card-selection-fade 1.2s ease-out forwards; }
    .pokemon-dex-card.caught { border-color: #2ea043; background: rgba(35, 134, 54, 0.12); }
    @keyframes pokemon-card-selection-fade {
      0% { border-color: #58a6ff; background: #1f4f78; box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.35); }
      100% { border-color: #484f58; background: #30363d; box-shadow: none; }
    }
    .pokemon-dex-card.unavailable { border-style: dashed; border-color: #6e7681; }
    .pokemon-card-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; }
    .pokemon-card-summary { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .pokemon-card-summary:hover .pokemon-card-name h3 { color: #58a6ff; }
    .pokemon-card-summary:focus-visible { outline: 2px solid #58a6ff; outline-offset: 4px; border-radius: 8px; }
    .pokemon-card-chevron { color: #8b949e; font-size: 1rem; transition: transform 0.18s ease; }
    .pokemon-card-chevron.open { transform: rotate(180deg); }
    .pokemon-card-details { display: grid; gap: 12px; }
    .pokedex-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
    .pokedex-search label { display: grid; gap: 6px; font-weight: 700; }
    .pokedex-search input { min-width: 0; }
    .pokedex-search-summary { margin: 8px 0 0; }
    .pokemon-card-sprite { width: 72px; height: 72px; object-fit: contain; padding: 6px; border: 1px solid #21262d; border-radius: 10px; background: #070b10; }
    .pokemon-card-name { display: grid; justify-items: start; gap: 4px; min-width: 0; }
    .pokemon-card-name h3 { margin: 0; overflow-wrap: anywhere; }
    .pokemon-type-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .pokemon-type-badge { display: inline-flex; padding: 5px 9px; border-radius: 999px; color: #fff; font-size: 0.75rem; font-weight: 800; line-height: 1; text-shadow: 0 1px 2px #000; }
    .pokemon-type-missing { font-size: 0.8rem; }
    .pokemon-caught-toggle { display: grid; justify-items: center; gap: 4px; margin: 0; color: #8b949e; font-size: 0.72rem; }
    .pokemon-caught-toggle input { width: 20px; height: 20px; padding: 0; accent-color: #2ea043; }
    .pokemon-caught-toggle input:disabled { cursor: not-allowed; opacity: 0.45; }
    .pokemon-unavailable-note { margin: 0; padding: 8px 10px; border: 1px solid #6e7681; border-radius: 8px; background: rgba(110, 118, 129, 0.12); color: #c9d1d9; font-size: 0.84rem; font-weight: 700; text-align: center; }
    .pokemon-resource-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 8px; }
    .pokemon-resource-card { display: grid; gap: 3px; padding: 9px 10px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; }
    .pokemon-resource-card > span { color: #8b949e; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
    .pokemon-resource-card strong { color: #f0c36b; font-size: 0.9rem; }
    .pokemon-resource-card small { color: #c9d1d9; font-size: 0.72rem; }
    .pokemon-mega-card { grid-column: 1 / -1; }
    .pokemon-mega-list { display: grid; gap: 7px; margin-top: 2px; }
    .pokemon-mega-entry { display: grid; gap: 2px; padding-top: 7px; border-top: 1px solid #30363d; }
    .pokemon-mega-entry:first-child { padding-top: 0; border-top: 0; }
    .pokemon-mega-entry strong { color: #d2a8ff; }
    .pokemon-mega-entry small { display: block; }
    .pokemon-evolution-sections { display: grid; gap: 12px; padding-top: 10px; border-top: 1px solid #21262d; }
    .pokemon-evolution-section { display: grid; gap: 7px; }
    .pokemon-evolution-section h4 { margin: 0; color: #c9d1d9; font-size: 0.84rem; }
    .pokemon-evolution-list { display: grid; gap: 7px; }
    .pokemon-evolution-link { display: grid; grid-template-columns: auto 42px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 8px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; color: #fff; text-decoration: none; }
    .pokemon-evolution-link:hover { border-color: #58a6ff; background: #1c2128; }
    .pokemon-evolution-direction { color: #9ecbff; font-size: 1.1rem; font-weight: 800; }
    .pokemon-evolution-link img { width: 42px; height: 42px; object-fit: contain; padding: 3px; border-radius: 7px; background: #070b10; }
    .pokemon-evolution-name { display: grid; gap: 2px; min-width: 0; }
    .pokemon-evolution-name strong { overflow-wrap: anywhere; }
    .pokemon-evolution-name small { color: #8b949e; font-family: monospace; }
    .pokemon-evolution-cost { display: grid; justify-items: end; gap: 2px; color: #f0c36b; font-size: 0.8rem; font-weight: 800; text-align: right; }
    .pokemon-evolution-cost small { max-width: 130px; color: #8b949e; font-size: 0.68rem; font-weight: 600; }
    .pokemon-evolution-cost .pokemon-trade-cost { color: #7ee787; font-weight: 800; }
    .pokemon-no-evolutions { margin: 0; padding-top: 10px; border-top: 1px solid #21262d; font-size: 0.82rem; }
    @media (max-width: 700px) {
      .pokemon-card-grid { grid-template-columns: 1fr; }
      .pokemon-evolution-link { grid-template-columns: auto 42px minmax(0, 1fr); }
      .pokemon-evolution-cost { grid-column: 2 / -1; justify-items: start; text-align: left; }
    }
    @media (max-width: 430px) {
      .pokemon-card-summary { grid-template-columns: 62px minmax(0, 1fr); }
      .pokemon-card-sprite { width: 62px; height: 62px; }
      .pokemon-caught-toggle span { display: none; }
      .pokemon-resource-grid { grid-template-columns: 1fr; }
      .pokedex-search { grid-template-columns: 1fr; }
      .region-meta p { display: none; }
    }
  `}</style>
}

function TypeBadge({ type }) {
  return (
    <span
      className="pokemon-type-badge"
      style={{ backgroundColor: TYPE_COLOURS[type] || "#57606a" }}
    >
      {type}
    </span>
  )
}

function candyCostLabel(candyRequired) {
  if (candyRequired === null || candyRequired === undefined || candyRequired === "") {
    return "Candy cost unavailable"
  }
  if (Number(candyRequired) === 0) return "No Candy required"
  if (Number.isFinite(Number(candyRequired))) {
    return `${Number(candyRequired)} Candy`
  }
  return "Candy cost unavailable"
}

function formatNumber(value) {
  return Number(value).toLocaleString()
}

function PokemonResourceDetails({ details }) {
  const secondMoveCost = details?.secondMoveCost
  const buddyDistance = Number(details?.buddyDistance)
  const megaEvolutions = Array.isArray(details?.megaEvolutions)
    ? details.megaEvolutions
    : []

  return (
    <div className="pokemon-resource-grid">
      <div className="pokemon-resource-card">
        <span>Second charged move</span>
        {secondMoveCost ? (
          <>
            <strong>{formatNumber(secondMoveCost.stardust)} Stardust</strong>
            <small>
              {secondMoveCost.candy === null
                ? "Candy cost unavailable"
                : `${formatNumber(secondMoveCost.candy)} Candy`}
            </small>
          </>
        ) : (
          <strong>Cost unavailable</strong>
        )}
      </div>
      <div className="pokemon-resource-card">
        <span>Buddy reward</span>
        {Number.isFinite(buddyDistance) && buddyDistance > 0 ? (
          <>
            <strong>{buddyDistance} km</strong>
            <small>Walk per Candy earned</small>
          </>
        ) : (
          <strong>Distance unavailable</strong>
        )}
      </div>
      {megaEvolutions.length > 0 && (
        <div className="pokemon-resource-card pokemon-mega-card">
          <span>Mega Evolution</span>
          <div className="pokemon-mega-list">
            {megaEvolutions.map((megaEvolution, index) => (
              <div
                className="pokemon-mega-entry"
                key={`${megaEvolution.megaName}-${megaEvolution.form || index}`}
              >
                <strong>{megaEvolution.megaName}</strong>
                <small>
                  First: {formatNumber(megaEvolution.firstTimeEnergy)} Mega Energy
                </small>
                <small>
                  Repeat: {formatNumber(megaEvolution.repeatEnergy)} Mega Energy
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EvolutionLink({ relationship, direction, onNavigate }) {
  const formNotes = []
  if (relationship.sourceForm) formNotes.push(`${relationship.sourceForm} source`)
  if (relationship.targetForm) formNotes.push(`${relationship.targetForm} target`)

  return (
    <a
      href={`#pokemon-${relationship.pokemonId}`}
      className="pokemon-evolution-link"
      onClick={(event) => {
        event.preventDefault()
        onNavigate(relationship.pokemonId)
      }}
    >
      <span className="pokemon-evolution-direction" aria-hidden="true">
        {direction === "previous" ? "←" : "→"}
      </span>
      <img
        src={buildSpriteUrl(relationship.pokemonId)}
        alt=""
        loading="lazy"
      />
      <span className="pokemon-evolution-name">
        <strong>{relationship.pokemonName}</strong>
        <small>#{String(relationship.pokemonId).padStart(3, "0")}</small>
      </span>
      <span className="pokemon-evolution-cost">
        {candyCostLabel(relationship.candyRequired)}
        {relationship.noCandyCostIfTraded && (
          <small className="pokemon-trade-cost">0 Candy after trade</small>
        )}
        {formNotes.length > 0 && <small>{formNotes.join(" · ")}</small>}
      </span>
    </a>
  )
}

function EvolutionStageLinks({ details, onNavigate }) {
  const previous = details?.previous || []
  const next = details?.next || []

  if (!previous.length && !next.length) {
    return <p className="muted pokemon-no-evolutions">No evolutions</p>
  }

  return (
    <div className="pokemon-evolution-sections">
      {previous.length > 0 && (
        <section className="pokemon-evolution-section">
          <h4>Previous evolution</h4>
          <div className="pokemon-evolution-list">
            {previous.map((relationship, index) => (
              <EvolutionLink
                key={`previous-${relationship.pokemonId}-${index}`}
                relationship={relationship}
                direction="previous"
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}

      {next.length > 0 && (
        <section className="pokemon-evolution-section">
          <h4>Next evolution</h4>
          <div className="pokemon-evolution-list">
            {next.map((relationship, index) => (
              <EvolutionLink
                key={`next-${relationship.pokemonId}-${index}`}
                relationship={relationship}
                direction="next"
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PokemonCard({
  pokemon,
  details,
  caught,
  released,
  availabilityKnown,
  onToggle,
  onNavigate,
  expanded,
  onExpand,
}) {
  const unavailable = availabilityKnown && !released

  return (
    <article
      id={`pokemon-${pokemon.dexNumber}`}
      className={`pokemon-dex-card ${caught ? "caught" : ""} ${
        unavailable ? "unavailable" : ""
      } ${expanded && !caught ? "selected" : ""}`}
    >
      <div className="pokemon-card-heading">
        <button
          type="button"
          className="pokemon-card-summary"
          onClick={() => onExpand(pokemon.dexNumber)}
          aria-expanded={expanded}
          aria-controls={`pokemon-details-${pokemon.dexNumber}`}
        >
          <img
            src={buildSpriteUrl(pokemon.dexNumber)}
            alt={pokemon.name}
            className="pokemon-card-sprite"
            loading="lazy"
          />
          <div className="pokemon-card-name">
            <span className="dex-number">
              #{String(pokemon.dexNumber).padStart(3, "0")}
            </span>
            <h3>{pokemon.name}</h3>
            <div className="pokemon-type-list">
              {details?.types?.length ? (
                details.types.map((type) => <TypeBadge key={type} type={type} />)
              ) : (
                <span className="muted pokemon-type-missing">Typing unavailable</span>
              )}
            </div>
          </div>
        </button>
        <label className="pokemon-caught-toggle">
          <input
            type="checkbox"
            checked={caught}
            disabled={unavailable}
            onChange={() => onToggle(pokemon.dexNumber)}
          />
          <span>{caught ? "Caught" : "Missing"}</span>
        </label>
        <span
          className={`pokemon-card-chevron ${expanded ? "open" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </div>

      {expanded && (
        <div
          id={`pokemon-details-${pokemon.dexNumber}`}
          className="pokemon-card-details"
        >
          {unavailable && (
            <p className="pokemon-unavailable-note">
              Not available in Pokémon GO yet
            </p>
          )}

          <PokemonResourceDetails details={details} />
          <EvolutionStageLinks details={details} onNavigate={onNavigate} />
        </div>
      )}
    </article>
  )
}

function PokedexRegion({
  region,
  detailsByPokemon,
  caughtSet,
  releasedSet,
  availabilityKnown,
  onToggle,
  onNavigate,
  focusedDex,
  expandedDex,
  onExpand,
  forceOpen,
}) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (
      forceOpen ||
      (focusedDex &&
        region.pokemon.some((pokemon) => pokemon.dexNumber === focusedDex))
    ) {
      setIsOpen(true)
    }
  }, [focusedDex, forceOpen, region.pokemon])

  const releasedPokemon = availabilityKnown
    ? region.pokemon.filter((pokemon) => releasedSet.has(pokemon.dexNumber))
    : region.pokemon
  const caughtCount = releasedPokemon.filter((pokemon) =>
    caughtSet.has(pokemon.dexNumber)
  ).length

  return (
    <div className="card pokedex-region">
      <button
        type="button"
        className="region-header"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-expanded={isOpen}
      >
        <div>
          <h2>{region.region}</h2>
          <p className="muted region-count">
            {caughtCount}/{releasedPokemon.length} caught · {region.pokemon.length} in National Dex
          </p>
        </div>
        <div className="region-meta">
          <p className="muted">
            #{region.pokemon[0].dexNumber} – #{
              region.pokemon[region.pokemon.length - 1].dexNumber
            }
          </p>
          <span className={`chevron ${isOpen ? "open" : ""}`} aria-hidden="true">
            ▾
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="pokemon-card-grid">
          {region.pokemon.map((pokemon) => {
            const released =
              !availabilityKnown || releasedSet.has(pokemon.dexNumber)
            return (
              <PokemonCard
                key={pokemon.dexNumber}
                pokemon={pokemon}
                details={detailsByPokemon?.[pokemon.dexNumber]}
                caught={caughtSet.has(pokemon.dexNumber)}
                released={released}
                availabilityKnown={availabilityKnown}
                onToggle={onToggle}
                onNavigate={onNavigate}
                expanded={expandedDex === pokemon.dexNumber}
                onExpand={onExpand}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PokedexPage() {
  const { data: session, status } = useSession()
  const [catalog, setCatalog] = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState("")
  const [caughtSet, setCaughtSet] = useState(new Set())
  const [isLoadingCaught, setIsLoadingCaught] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [lastSaved, setLastSaved] = useState(null)
  const [focusedDex, setFocusedDex] = useState(null)
  const [expandedDex, setExpandedDex] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (status !== "authenticated") return

    const fetchCatalog = async () => {
      setCatalogLoading(true)
      setCatalogError("")
      try {
        const response = await fetch("/api/pokedex-catalog")
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || "Unable to load the Pokédex")
        }
        setCatalog(data)
      } catch (error) {
        setCatalogError(error.message)
      } finally {
        setCatalogLoading(false)
      }
    }

    const fetchCaught = async () => {
      setIsLoadingCaught(true)
      try {
        const response = await fetch("/api/pokedex")
        if (!response.ok) throw new Error("Unable to load your Pokédex progress")
        const data = await response.json()
        setCaughtSet(new Set(data.dexNumbers.map(Number)))
      } catch (error) {
        setStatusMessage(error.message)
      } finally {
        setIsLoadingCaught(false)
      }
    }

    fetchCatalog()
    fetchCaught()
  }, [status])

  const allDexNumbers = useMemo(
    () =>
      new Set(
        catalog?.regions?.flatMap((region) =>
          region.pokemon.map((pokemon) => pokemon.dexNumber)
        ) || []
      ),
    [catalog]
  )

  const releasedSet = useMemo(
    () => new Set((catalog?.releasedDexNumbers || []).map(Number)),
    [catalog]
  )

  const filteredRegions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return catalog?.regions || []

    const dexQuery = query.replace(/^#/, "")
    const numericSearch = /^\d+$/.test(dexQuery)
    const normalisedDexQuery = numericSearch ? String(Number(dexQuery)) : ""
    const paddedDexQuery = numericSearch ? dexQuery.padStart(3, "0") : ""

    return (catalog?.regions || [])
      .map((region) => ({
        ...region,
        pokemon: region.pokemon.filter((pokemon) => {
          const nameMatches = pokemon.name.toLowerCase().includes(query)
          if (!numericSearch) return nameMatches

          const dexNumber = String(pokemon.dexNumber)
          return (
            nameMatches ||
            dexNumber === normalisedDexQuery ||
            dexNumber.padStart(3, "0") === paddedDexQuery
          )
        }),
      }))
      .filter((region) => region.pokemon.length > 0)
  }, [catalog, searchQuery])

  const searchResultCount = filteredRegions.reduce(
    (total, region) => total + region.pokemon.length,
    0
  )

  const trackableSet = catalog?.availabilityKnown ? releasedSet : allDexNumbers
  const caughtCount = Array.from(caughtSet).filter((dexNumber) =>
    trackableSet.has(dexNumber)
  ).length
  const trackableCount = trackableSet.size
  const caughtPercentage = trackableCount
    ? Math.round((caughtCount / trackableCount) * 100)
    : 0

  const toggleCaught = (dexNumber) => {
    if (!trackableSet.has(dexNumber)) return

    setCaughtSet((previous) => {
      const next = new Set(previous)
      next.has(dexNumber) ? next.delete(dexNumber) : next.add(dexNumber)
      return next
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setStatusMessage("")
    try {
      const dexNumbers = Array.from(caughtSet).filter((dexNumber) =>
        trackableSet.has(dexNumber)
      )
      const response = await fetch("/api/pokedex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexNumbers }),
      })

      if (!response.ok) throw new Error("Failed to save your Pokédex.")
      const data = await response.json()
      setCaughtSet(new Set(data.dexNumbers.map(Number)))
      setLastSaved(new Date())
      setStatusMessage("Pokédex saved successfully!")
    } catch (error) {
      setStatusMessage(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const togglePokemonDetails = (dexNumber) => {
    setFocusedDex(dexNumber)
    setExpandedDex((current) => (current === dexNumber ? null : dexNumber))
  }

  const navigateToPokemon = (dexNumber) => {
    setSearchQuery("")
    setExpandedDex(dexNumber)
    setFocusedDex(dexNumber)
    window.setTimeout(() => {
      document
        .getElementById(`pokemon-${dexNumber}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 150)
  }

  if (status === "loading") {
    return <div className="container"><p>Loading session…</p></div>
  }

  if (!session) {
    return (
      <div className="container">
        <div className="card">
          <h1>Pokédex</h1>
          <p className="muted">Please sign in to view and track your Pokédex.</p>
        </div>
      </div>
    )
  }

  if (catalogLoading && !catalog) {
    return <div className="container"><div className="card"><h1>Pokédex</h1><p className="muted">Loading the National Dex from the local data cache…</p></div></div>
  }

  if (catalogError && !catalog) {
    return <div className="container"><div className="card"><h1>Pokédex</h1><p className="status-text">{catalogError}</p></div></div>
  }

  return (
    <div className="container pokedex-page">
      <div className="card pokedex-hero">
        <div>
          <h1>Pokédex</h1>
          <p className="muted">
            Full National Dex grouped by region, with typing, evolution costs, Mega Energy costs, second charged-move costs and Buddy Candy distances.
          </p>
          <p className="muted">
            Progress: {caughtCount} / {trackableCount} released Pokémon ({caughtPercentage}%)
          </p>
          {catalog?.stale && (
            <p className="muted">Using the last locally cached data while an update check is unavailable.</p>
          )}
          {catalog && !catalog.availabilityKnown && (
            <p className="status-text">Release status is temporarily unavailable, so availability labels are hidden.</p>
          )}
          {catalog?.checkedAt && (
            <p className="muted">Data hashes last checked: {new Date(catalog.checkedAt).toLocaleString()}</p>
          )}
          {lastSaved && <p className="muted">Last saved: {lastSaved.toLocaleString()}</p>}
        </div>
        <div className="pokedex-actions">
          <button
            onClick={handleSave}
            disabled={isSaving || isLoadingCaught || !catalog}
          >
            {isSaving ? "Saving…" : "Save progress"}
          </button>
          {statusMessage && <p className="status-text">{statusMessage}</p>}
        </div>
      </div>

      <div className="card">
        <div className="pokedex-search">
          <label htmlFor="pokedex-search">
            Search Pokémon
            <input
              id="pokedex-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Name or National Dex number"
            />
          </label>
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")}>
              Clear
            </button>
          )}
        </div>
        <p className="muted pokedex-search-summary">
          {searchQuery.trim()
            ? `${searchResultCount} matching Pokémon`
            : "Regions and Pokémon details are collapsed by default."}
        </p>
      </div>

      {isLoadingCaught && <p className="muted">Loading your saved Pokédex progress…</p>}

      {searchQuery.trim() && searchResultCount === 0 && (
        <div className="card">
          <p className="muted">No Pokémon match that search.</p>
        </div>
      )}

      {filteredRegions.map((region) => (
        <PokedexRegion
          key={region.region}
          region={region}
          detailsByPokemon={catalog.pokemon}
          caughtSet={caughtSet}
          releasedSet={releasedSet}
          availabilityKnown={catalog.availabilityKnown}
          onToggle={toggleCaught}
          onNavigate={navigateToPokemon}
          focusedDex={focusedDex}
          expandedDex={expandedDex}
          onExpand={togglePokemonDetails}
          forceOpen={Boolean(searchQuery.trim())}
        />
      ))}
      <PokedexStyles />
    </div>
  )
}
