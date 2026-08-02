const TYPE_COLOURS = {
  Bug: "#729f3f", Dark: "#4f3a34", Dragon: "#5368c4", Electric: "#d6ad00",
  Fairy: "#c75b9f", Fighting: "#b4462f", Fire: "#d65a31", Flying: "#6d91c8",
  Ghost: "#66538c", Grass: "#4f9b45", Ground: "#b58b3d", Ice: "#5bb8c8",
  Normal: "#777d82", Poison: "#8d4d9f", Psychic: "#d65078", Rock: "#9a8738",
  Steel: "#607d8b", Water: "#3d78bd",
}

const spriteUrl = (dexNumber) =>
  `https://raw.githubusercontent.com/nileplumb/PkmnHomeIcons/master/UICONS_OS/pokemon/${dexNumber}.png`

const multiplierLabel = (value) => `×${Number(Number(value).toFixed(3))}`

function TypeBadge({ type, multiplier }) {
  return (
    <span className="pokedex-type" style={{ backgroundColor: TYPE_COLOURS[type] || "#57606a" }}>
      {type}{multiplier !== undefined && <small>{multiplierLabel(multiplier)}</small>}
    </span>
  )
}

function TypeList({ items, emptyText }) {
  if (!items?.length) return <p className="muted pokedex-compact">{emptyText}</p>
  return (
    <div className="pokedex-types">
      {items.map((item) => (
        <TypeBadge key={item.type} type={item.type} multiplier={item.multiplier} />
      ))}
    </div>
  )
}

function EvolutionCard({ evolution, direction, releasedSet, onNavigate }) {
  const linkEnabled = releasedSet.has(evolution.pokemonId)
  const targetForm = evolution.form !== "Normal" ? evolution.form : null
  const sourceForm = evolution.sourceForm !== "Normal" ? evolution.sourceForm : null

  return (
    <div className="evolution-card">
      <a
        href={linkEnabled ? `#pokemon-${evolution.pokemonId}` : "#"}
        className={linkEnabled ? "evolution-link" : "evolution-link disabled"}
        aria-disabled={!linkEnabled}
        tabIndex={linkEnabled ? undefined : -1}
        onClick={(event) => {
          event.preventDefault()
          if (linkEnabled) onNavigate(evolution.pokemonId)
        }}
      >
        <img src={spriteUrl(evolution.pokemonId)} alt="" loading="lazy" />
        <span><strong>{evolution.pokemonName}</strong><small>#{String(evolution.pokemonId).padStart(3, "0")}</small></span>
      </a>
      <div className="evolution-rules">
        {direction === "to" && sourceForm && <span>From {sourceForm} form</span>}
        {targetForm && <span>{targetForm} form</span>}
        {evolution.randomOutcome && <span>Random outcome</span>}
        {!linkEnabled && <span>Not currently released</span>}
        {evolution.requirements?.map((requirement) => <span key={requirement}>{requirement}</span>)}
      </div>
    </div>
  )
}

function Details({ details, loading, error, releasedSet, onNavigate }) {
  if (loading) return <p className="muted pokedex-detail-message">Loading POGOAPI details…</p>
  if (!details) return <p className="muted pokedex-detail-message">{error || "No POGOAPI details available."}</p>

  return (
    <div className="pokedex-details">
      <section>
        <h3>Typing</h3>
        <div className="pokedex-types">{details.types?.map((type) => <TypeBadge key={type} type={type} />)}</div>
      </section>
      <div className="pokedex-matchups">
        <section><h3>Weak to</h3><TypeList items={details.weaknesses} emptyText="No weaknesses listed." /></section>
        <section><h3>Resists</h3><TypeList items={details.resistances} emptyText="No resistances listed." /></section>
      </div>
      <section>
        <h3>Strong against</h3>
        <p className="muted pokedex-compact">Same-type attacks that deal super-effective damage.</p>
        <div className="pokedex-offence">
          {details.offensiveStrengths?.map((group) => (
            <div key={group.type}>
              <TypeBadge type={group.type} /><b>→</b>
              <div className="pokedex-types">
                {group.targets?.map((target) => <TypeBadge key={target.type} type={target.type} multiplier={target.multiplier} />)}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Evolution family</h3>
        {details.evolvesFrom?.length > 0 && (
          <div className="evolution-group"><h4>Evolves from</h4><div className="evolution-grid">
            {details.evolvesFrom.map((evolution, index) => (
              <EvolutionCard key={`from-${evolution.pokemonId}-${index}`} evolution={evolution} direction="from" releasedSet={releasedSet} onNavigate={onNavigate} />
            ))}
          </div></div>
        )}
        {details.evolvesTo?.length > 0 && (
          <div className="evolution-group"><h4>Evolves into</h4><div className="evolution-grid">
            {details.evolvesTo.map((evolution, index) => (
              <EvolutionCard key={`to-${evolution.pokemonId}-${index}`} evolution={evolution} direction="to" releasedSet={releasedSet} onNavigate={onNavigate} />
            ))}
          </div></div>
        )}
        {!details.evolvesFrom?.length && !details.evolvesTo?.length && <p className="muted pokedex-compact">No evolution links listed.</p>}
      </section>
    </div>
  )
}

export function PokemonEntry({ pokemon, checked, onToggle, details, expanded, onExpand, onNavigate, infoLoading, infoError, releasedSet }) {
  return (
    <article id={`pokemon-${pokemon.dexNumber}`} className={`pokedex-entry ${checked ? "caught" : ""} ${expanded ? "expanded" : ""}`}>
      <div className="pokedex-entry-head">
        <label className="pokedex-caught">
          <input type="checkbox" checked={checked} onChange={() => onToggle(pokemon.dexNumber)} />
          <span>{checked ? "Caught" : "Missing"}</span>
        </label>
        <button type="button" className="pokedex-open" onClick={onExpand} aria-expanded={expanded}>
          <img src={spriteUrl(pokemon.dexNumber)} alt={pokemon.name} loading="lazy" />
          <span className="pokedex-entry-name">
            <small>#{String(pokemon.dexNumber).padStart(3, "0")}</small>
            <strong>{pokemon.name}</strong>
            <span className="pokedex-types">{details?.types?.map((type) => <TypeBadge key={type} type={type} />)}</span>
          </span>
          <b className={expanded ? "open" : ""}>▾</b>
        </button>
      </div>
      {expanded && <Details details={details} loading={infoLoading} error={infoError} releasedSet={releasedSet} onNavigate={onNavigate} />}
    </article>
  )
}

export function PokedexStyles() {
  return <style jsx global>{`
    .pokedex-page{max-width:1100px}.pokedex-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.pokedex-actions{display:grid;gap:8px;text-align:right}.pokedex-toolbar{display:grid;gap:12px}.pokedex-filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px}.pokedex-filters label{display:grid;gap:6px;margin:0}.pokedex-filter-summary{display:flex;justify-content:space-between;align-items:center;color:#8b949e;font-weight:600}.pokedex-clear{width:auto;padding:7px 11px;background:transparent;border:1px solid #30363d;color:#c9d1d9}.pokedex-clear:hover{background:#21262d}.pokedex-region-head{display:flex;width:100%;align-items:center;justify-content:space-between;text-align:left;padding:0;background:none;color:#c9d1d9}.pokedex-region-head:hover{background:none}.pokedex-region-head>span{display:flex;align-items:center;gap:10px}.pokedex-region-head b,.pokedex-open>b{transition:transform .15s}.pokedex-region-head b.open,.pokedex-open>b.open{transform:rotate(180deg)}.pokedex-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin-top:16px}.pokedex-entry{display:grid;padding:10px;border:1px solid #30363d;border-radius:10px;background:#0d1117;scroll-margin-top:90px}.pokedex-entry.caught{border-color:#2ea043;background:rgba(35,134,54,.12)}.pokedex-entry.expanded{grid-column:1/-1;border-color:#58a6ff}.pokedex-entry-head{display:grid;grid-template-columns:auto 1fr;gap:10px}.pokedex-caught{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:58px;margin:0;padding:6px;border-right:1px solid #21262d;color:#8b949e;font-size:.72rem}.pokedex-caught input{width:18px;height:18px;padding:0;accent-color:#2ea043}.pokedex-open{display:grid;grid-template-columns:64px 1fr auto;align-items:center;gap:12px;width:100%;padding:0;background:transparent;text-align:left;color:#fff}.pokedex-open:hover{background:transparent}.pokedex-open>img{width:64px;height:64px;object-fit:contain;padding:6px;border:1px solid #1f2933;border-radius:8px;background:#0a0f14}.pokedex-entry-name{display:grid;justify-items:start;gap:3px}.pokedex-entry-name>small{color:#9ecbff;font-family:monospace}.pokedex-types{display:flex;align-items:center;flex-wrap:wrap;gap:6px}.pokedex-type{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;color:#fff;font-size:.74rem;font-weight:800;line-height:1;text-shadow:0 1px 2px #000}.pokedex-type small{padding-left:5px;border-left:1px solid rgba(255,255,255,.45);font-family:monospace}.pokedex-details{display:grid;gap:16px;margin-top:12px;padding:16px;border-top:1px solid #30363d;background:rgba(22,27,34,.72);border-radius:0 0 8px 8px}.pokedex-details section{display:grid;gap:8px}.pokedex-details h3,.pokedex-details h4{margin:0}.pokedex-detail-message{margin-top:12px;padding-top:12px;border-top:1px solid #30363d}.pokedex-compact{margin:0;font-size:.85rem}.pokedex-matchups{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pokedex-offence{display:grid;gap:8px}.pokedex-offence>div{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px;padding:9px;border:1px solid #30363d;border-radius:8px;background:#0d1117}.pokedex-offence b{color:#8b949e}.evolution-group{display:grid;gap:8px}.evolution-group+.evolution-group{margin-top:8px}.evolution-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.evolution-card{display:grid;gap:8px;padding:10px;border:1px solid #30363d;border-radius:8px;background:#0d1117}.evolution-link{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none}.evolution-link:hover strong{color:#9ecbff;text-decoration:underline}.evolution-link.disabled{opacity:.65;cursor:default}.evolution-link.disabled:hover strong{color:inherit;text-decoration:none}.evolution-link img{width:48px;height:48px;object-fit:contain;padding:4px;border:1px solid #21262d;border-radius:8px;background:#070b10}.evolution-link>span{display:grid;gap:2px}.evolution-link small{color:#8b949e;font-family:monospace}.evolution-rules{display:flex;flex-wrap:wrap;gap:5px}.evolution-rules span{padding:4px 7px;border-radius:999px;background:#21262d;color:#c9d1d9;font-size:.75rem}.pokedex-error{color:#ffb4ae}.pokedex-empty{text-align:center}
    @media(max-width:760px){.pokedex-filters,.pokedex-matchups{grid-template-columns:1fr}.pokedex-actions{width:100%;text-align:left}.pokedex-region-head>span p{display:none}.pokedex-grid{grid-template-columns:1fr}.pokedex-clear{max-width:150px}.pokedex-open,.pokedex-region-head{width:100%}}
    @media(max-width:460px){.pokedex-entry-head{grid-template-columns:1fr}.pokedex-caught{flex-direction:row;justify-content:flex-start;min-width:0;border-right:0;border-bottom:1px solid #21262d}.pokedex-open{grid-template-columns:58px 1fr auto}.pokedex-open>img{width:58px;height:58px}.pokedex-offence>div{grid-template-columns:auto auto}.pokedex-offence .pokedex-types{grid-column:1/-1}}
  `}</style>
}
