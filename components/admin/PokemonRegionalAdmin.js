import { useEffect, useMemo, useState } from "react"

const REGIONAL_AREAS = [
  "Europe",
  "Asia",
  "Africa",
  "North America",
  "South America",
  "Central America & Caribbean",
  "Oceania",
  "Middle East",
  "Northern Hemisphere",
  "Southern Hemisphere",
  "Eastern Hemisphere",
  "Western Hemisphere",
  "Polar regions",
  "Multiple regions / varies by form",
]

function splitCustomLocations(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function draftFromOverride(override) {
  const regions = Array.isArray(override?.regions) ? override.regions : []
  const known = regions.filter((region) => REGIONAL_AREAS.includes(region))
  const custom = regions.filter((region) => !REGIONAL_AREAS.includes(region))
  return {
    isRegional: Boolean(override?.isRegional),
    regions: known,
    customLocations: custom.join(", "),
    note: override?.note || "",
  }
}

export default function PokemonRegionalAdmin() {
  const [catalog, setCatalog] = useState(null)
  const [overrides, setOverrides] = useState([])
  const [drafts, setDrafts] = useState({})
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState("regional")
  const [onlyRegional, setOnlyRegional] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingDex, setSavingDex] = useState(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setMessage("")
      try {
        const [catalogResponse, overridesResponse] = await Promise.all([
          fetch(`/api/pokedex-catalog?regional-admin=${Date.now()}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          }),
          fetch(`/api/admin/pokemon-regional-overrides?request=${Date.now()}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          }),
        ])
        const [catalogData, overridesData] = await Promise.all([
          catalogResponse.json(),
          overridesResponse.json(),
        ])
        if (!catalogResponse.ok) {
          throw new Error(catalogData.error || "Unable to load Pokédex data")
        }
        if (!overridesResponse.ok) {
          throw new Error(overridesData.error || "Unable to load regional status")
        }

        const values = overridesData.overrides || []
        setCatalog(catalogData)
        setOverrides(values)
        setDrafts(
          Object.fromEntries(
            values.map((override) => [
              override.dexNumber,
              draftFromOverride(override),
            ])
          )
        )
      } catch (error) {
        setMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const rows = useMemo(() => {
    const overrideMap = new Map(
      overrides.map((override) => [Number(override.dexNumber), override])
    )
    const normalisedQuery = query.trim().toLowerCase()
    const values = (catalog?.regions || []).flatMap((region) =>
      region.pokemon.map((pokemon) => {
        const override = overrideMap.get(Number(pokemon.dexNumber)) || null
        return {
          ...pokemon,
          generationRegion: region.region,
          override,
          isRegional: Boolean(override?.isRegional),
          regionalLocations: override?.regions || [],
        }
      })
    )

    const filtered = values.filter((row) => {
      if (onlyRegional && !row.isRegional) return false
      if (!normalisedQuery) return true
      return (
        row.name.toLowerCase().includes(normalisedQuery) ||
        String(row.dexNumber).includes(normalisedQuery) ||
        row.generationRegion.toLowerCase().includes(normalisedQuery) ||
        row.regionalLocations.join(" ").toLowerCase().includes(normalisedQuery)
      )
    })

    return filtered.sort((left, right) => {
      if (sort === "regional" && left.isRegional !== right.isRegional) {
        return left.isRegional ? -1 : 1
      }
      if (sort === "name") return left.name.localeCompare(right.name)
      return Number(left.dexNumber) - Number(right.dexNumber)
    })
  }, [catalog, overrides, query, sort, onlyRegional])

  const regionalCount = rows.filter((row) => row.isRegional).length

  const draftFor = (row) =>
    drafts[row.dexNumber] || draftFromOverride(row.override)

  const updateDraft = (dexNumber, changes) => {
    setDrafts((current) => ({
      ...current,
      [dexNumber]: { ...(current[dexNumber] || {}), ...changes },
    }))
  }

  const saveRegionalStatus = async (row) => {
    const draft = draftFor(row)
    setSavingDex(row.dexNumber)
    setMessage("")
    try {
      if (!draft.isRegional) {
        const response = await fetch(
          `/api/admin/pokemon-regional-overrides?dexNumber=${row.dexNumber}`,
          { method: "DELETE" }
        )
        if (!response.ok && response.status !== 404) {
          const data = await response.json()
          throw new Error(data.error || "Unable to clear regional status")
        }
        setOverrides((current) =>
          current.filter((override) => override.dexNumber !== row.dexNumber)
        )
        setDrafts((current) => ({
          ...current,
          [row.dexNumber]: draftFromOverride(null),
        }))
        setMessage(`${row.name} marked as not regional.`)
        return
      }

      const regions = [
        ...(draft.regions || []),
        ...splitCustomLocations(draft.customLocations),
      ]
      const response = await fetch("/api/admin/pokemon-regional-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dexNumber: row.dexNumber,
          isRegional: true,
          regions,
          note: draft.note || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Unable to save regional status")
      }

      setOverrides((current) => [
        ...current.filter((override) => override.dexNumber !== row.dexNumber),
        data.override,
      ])
      setDrafts((current) => ({
        ...current,
        [row.dexNumber]: draftFromOverride(data.override),
      }))
      setMessage(
        `${row.name} marked regional${
          data.override.regions?.length
            ? `: ${data.override.regions.join(", ")}`
            : "."
        }`
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSavingDex(null)
    }
  }

  return (
    <div className="container admin-regional-container">
      <section className="card admin-regional-section">
        <div className="admin-regional-heading">
          <div>
            <h2>Regional Pokémon</h2>
            <p className="muted">
              Mark species that are normally location locked. Select several broad
              areas where needed, and use custom locations for country-specific locks.
            </p>
          </div>
          {message && <p className="status-text">{message}</p>}
        </div>

        <div className="admin-regional-controls">
          <label>
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, number or lock area"
            />
          </label>
          <label>
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="regional">Regional first</option>
              <option value="dex">National Dex order</option>
              <option value="name">Name</option>
            </select>
          </label>
          <label className="admin-regional-checkbox">
            <input
              type="checkbox"
              checked={onlyRegional}
              onChange={(event) => setOnlyRegional(event.target.checked)}
            />
            Regional only
          </label>
          <p className="muted admin-regional-summary">
            Showing {rows.length} · {regionalCount} regional
          </p>
        </div>

        {loading ? (
          <p className="muted">Loading regional selections…</p>
        ) : (
          <div className="admin-regional-list">
            {rows.map((row) => {
              const draft = draftFor(row)
              return (
                <article
                  className={`admin-regional-row ${draft.isRegional ? "regional" : ""}`}
                  key={row.dexNumber}
                >
                  <div className="admin-regional-name">
                    <strong>
                      #{String(row.dexNumber).padStart(3, "0")} {row.name}
                    </strong>
                    <small>{row.generationRegion}</small>
                    {row.isRegional && row.regionalLocations.length > 0 && (
                      <small>{row.regionalLocations.join(" · ")}</small>
                    )}
                  </div>
                  <label>
                    Regional status
                    <select
                      value={draft.isRegional ? "regional" : "not-regional"}
                      onChange={(event) =>
                        updateDraft(row.dexNumber, {
                          isRegional: event.target.value === "regional",
                        })
                      }
                    >
                      <option value="not-regional">Not regional</option>
                      <option value="regional">Regional</option>
                    </select>
                  </label>
                  <label>
                    Primary lock area(s)
                    <select
                      multiple
                      size="4"
                      disabled={!draft.isRegional}
                      value={draft.regions || []}
                      onChange={(event) =>
                        updateDraft(row.dexNumber, {
                          regions: Array.from(
                            event.target.selectedOptions,
                            (option) => option.value
                          ),
                        })
                      }
                    >
                      {REGIONAL_AREAS.map((area) => (
                        <option value={area} key={area}>{area}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Custom locations
                    <input
                      type="text"
                      disabled={!draft.isRegional}
                      value={draft.customLocations || ""}
                      onChange={(event) =>
                        updateDraft(row.dexNumber, {
                          customLocations: event.target.value,
                        })
                      }
                      placeholder="e.g. United Kingdom, Ireland"
                    />
                  </label>
                  <label>
                    Note
                    <input
                      type="text"
                      maxLength={500}
                      disabled={!draft.isRegional}
                      value={draft.note || ""}
                      onChange={(event) =>
                        updateDraft(row.dexNumber, { note: event.target.value })
                      }
                      placeholder="Optional form or event details"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => saveRegionalStatus(row)}
                    disabled={savingDex === row.dexNumber}
                  >
                    {savingDex === row.dexNumber ? "Saving…" : "Save regional"}
                  </button>
                </article>
              )
            })}
          </div>
        )}

        <style jsx>{`
          .admin-regional-container { max-width: 1250px; padding-top: 0; }
          .admin-regional-section { margin-top: -4px; }
          .admin-regional-heading h2 { margin-bottom: 6px; }
          .admin-regional-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 14px 0; }
          .admin-regional-controls label, .admin-regional-row label { display: grid; gap: 5px; font-size: 0.8rem; font-weight: 700; }
          .admin-regional-controls input[type="search"] { min-width: 260px; }
          .admin-regional-checkbox { grid-auto-flow: column; align-items: center; }
          .admin-regional-summary { margin: 0 0 7px auto; }
          .admin-regional-list { display: grid; gap: 8px; max-height: 760px; overflow: auto; padding-right: 4px; }
          .admin-regional-row { display: grid; grid-template-columns: minmax(170px, 1fr) 145px minmax(180px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr) auto; align-items: end; gap: 10px; padding: 12px; border: 1px solid #30363d; border-radius: 9px; background: #161b22; }
          .admin-regional-row.regional { border-left: 4px solid #a371f7; }
          .admin-regional-name { display: grid; gap: 3px; align-self: center; }
          .admin-regional-name small { color: #8b949e; }
          .admin-regional-row select[multiple] { min-height: 96px; }
          @media (max-width: 1050px) {
            .admin-regional-row { grid-template-columns: 1fr 1fr; }
            .admin-regional-row button { justify-self: start; }
            .admin-regional-summary { width: 100%; margin-left: 0; }
          }
          @media (max-width: 600px) {
            .admin-regional-controls, .admin-regional-row { display: grid; grid-template-columns: 1fr; }
            .admin-regional-controls input[type="search"] { min-width: 0; width: 100%; }
          }
        `}</style>
      </section>
    </div>
  )
}
