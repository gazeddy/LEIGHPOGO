from pathlib import Path

path = Path("pages/pokedex.js")
source = path.read_text()


def replace_once(old, new):
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match, found {count} for: {old[:80]!r}")
    source = source.replace(old, new, 1)


replace_once(
    "    .pokemon-card-heading { display: grid; grid-template-columns: 72px 1fr auto; align-items: center; gap: 12px; }",
    """    .pokemon-card-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; }
    .pokemon-card-summary { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
    .pokemon-card-summary:hover .pokemon-card-name h3 { color: #58a6ff; }
    .pokemon-card-summary:focus-visible { outline: 2px solid #58a6ff; outline-offset: 4px; border-radius: 8px; }
    .pokemon-card-chevron { color: #8b949e; font-size: 1rem; transition: transform 0.18s ease; }
    .pokemon-card-chevron.open { transform: rotate(180deg); }
    .pokemon-card-details { display: grid; gap: 12px; }
    .pokedex-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; }
    .pokedex-search label { display: grid; gap: 6px; font-weight: 700; }
    .pokedex-search input { min-width: 0; }
    .pokedex-search-summary { margin: 8px 0 0; }""",
)

replace_once(
    """    @media (max-width: 430px) {
      .pokemon-card-heading { grid-template-columns: 62px 1fr; }
      .pokemon-card-sprite { width: 62px; height: 62px; }
      .pokemon-caught-toggle { grid-column: 1 / -1; grid-auto-flow: column; justify-content: start; align-items: center; }
      .pokemon-resource-grid { grid-template-columns: 1fr; }
      .region-meta p { display: none; }
    }""",
    """    @media (max-width: 430px) {
      .pokemon-card-summary { grid-template-columns: 62px minmax(0, 1fr); }
      .pokemon-card-sprite { width: 62px; height: 62px; }
      .pokemon-caught-toggle span { display: none; }
      .pokemon-resource-grid { grid-template-columns: 1fr; }
      .pokedex-search { grid-template-columns: 1fr; }
      .region-meta p { display: none; }
    }""",
)

replace_once(
    """  onToggle,
  onNavigate,
}) {""",
    """  onToggle,
  onNavigate,
  expanded,
  onExpand,
}) {""",
)

start = source.index('      <div className="pokemon-card-heading">')
end = source.index("\n\n      {unavailable && (", start)
source = (
    source[:start]
    + """      <div className="pokemon-card-heading">
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
      </div>"""
    + source[end:]
)

replace_once(
    """      {unavailable && (
        <p className="pokemon-unavailable-note">
          Not available in Pokémon GO yet
        </p>
      )}

      <PokemonResourceDetails details={details} />
      <EvolutionStageLinks details={details} onNavigate={onNavigate} />""",
    """      {expanded && (
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
      )}""",
)

replace_once(
    """  onNavigate,
  focusedDex,
}) {
  const [isOpen, setIsOpen] = useState(true)""",
    """  onNavigate,
  focusedDex,
  expandedDex,
  onExpand,
  forceOpen,
}) {
  const [isOpen, setIsOpen] = useState(false)""",
)

replace_once(
    """    if (
      focusedDex &&
      region.pokemon.some((pokemon) => pokemon.dexNumber === focusedDex)
    ) {
      setIsOpen(true)
    }
  }, [focusedDex, region.pokemon])""",
    """    if (
      forceOpen ||
      (focusedDex &&
        region.pokemon.some((pokemon) => pokemon.dexNumber === focusedDex))
    ) {
      setIsOpen(true)
    }
  }, [focusedDex, forceOpen, region.pokemon])""",
)

replace_once(
    """                onToggle={onToggle}
                onNavigate={onNavigate}
              />""",
    """                onToggle={onToggle}
                onNavigate={onNavigate}
                expanded={expandedDex === pokemon.dexNumber}
                onExpand={onExpand}
              />""",
)

replace_once(
    """  const [lastSaved, setLastSaved] = useState(null)
  const [focusedDex, setFocusedDex] = useState(null)""",
    """  const [lastSaved, setLastSaved] = useState(null)
  const [focusedDex, setFocusedDex] = useState(null)
  const [expandedDex, setExpandedDex] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")""",
)

replace_once(
    """  const releasedSet = useMemo(
    () => new Set((catalog?.releasedDexNumbers || []).map(Number)),
    [catalog]
  )

  const trackableSet = catalog?.availabilityKnown ? releasedSet : allDexNumbers""",
    """  const releasedSet = useMemo(
    () => new Set((catalog?.releasedDexNumbers || []).map(Number)),
    [catalog]
  )

  const filteredRegions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return catalog?.regions || []

    const dexQuery = query.replace(/^#/, "")
    const numericSearch = /^\\d+$/.test(dexQuery)
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

  const trackableSet = catalog?.availabilityKnown ? releasedSet : allDexNumbers""",
)

replace_once(
    """  const navigateToPokemon = (dexNumber) => {
    setFocusedDex(dexNumber)""",
    """  const togglePokemonDetails = (dexNumber) => {
    setFocusedDex(dexNumber)
    setExpandedDex((current) => (current === dexNumber ? null : dexNumber))
  }

  const navigateToPokemon = (dexNumber) => {
    setSearchQuery("")
    setExpandedDex(dexNumber)
    setFocusedDex(dexNumber)""",
)

replace_once(
    """      {isLoadingCaught && <p className="muted">Loading your saved Pokédex progress…</p>}

      {catalog?.regions?.map((region) => (
        <PokedexRegion""",
    """      <div className="card">
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
        <PokedexRegion""",
)

replace_once(
    """          onNavigate={navigateToPokemon}
          focusedDex={focusedDex}
        />""",
    """          onNavigate={navigateToPokemon}
          focusedDex={focusedDex}
          expandedDex={expandedDex}
          onExpand={togglePokemonDetails}
          forceOpen={Boolean(searchQuery.trim())}
        />""",
)

path.write_text(source)

Path("__tests__/pokedex-folding-search.test.js").write_text(
    '''const fs = require("fs")
const path = require("path")

describe("Pokédex folding and search", () => {
  const page = fs.readFileSync(
    path.join(process.cwd(), "pages", "pokedex.js"),
    "utf8"
  )

  test("regions and Pokémon details start collapsed", () => {
    expect(page).toContain("const [isOpen, setIsOpen] = useState(false)")
    expect(page).toContain("const [expandedDex, setExpandedDex] = useState(null)")
    expect(page).toContain("{expanded && (")
    expect(page).toContain("aria-expanded={expanded}")
  })

  test("search filters by name or National Dex number and opens result regions", () => {
    expect(page).toContain('type="search"')
    expect(page).toContain("pokemon.name.toLowerCase().includes(query)")
    expect(page).toContain('query.replace(/^#/, "")')
    expect(page).toContain("forceOpen={Boolean(searchQuery.trim())}")
    expect(page).toContain("No Pokémon match that search.")
  })

  test("evolution navigation clears search and expands the destination", () => {
    expect(page).toContain('setSearchQuery("")')
    expect(page).toContain("setExpandedDex(dexNumber)")
  })
})
'''
)
