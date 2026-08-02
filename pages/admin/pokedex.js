import Link from "next/link"
import { getServerSession } from "next-auth/next"
import { useEffect, useMemo, useState } from "react"
import { authOptions } from "../api/auth/[...nextauth]"

const { applyPokemonAvailabilityOverrides, sortPokemonAvailabilityRows } = require("../../lib/pokemonAvailability")

const POKEDEX_CATALOG_CLIENT_VERSION = 4
const buildCatalogRequestUrl = () =>
  `/api/pokedex-catalog?v=${POKEDEX_CATALOG_CLIENT_VERSION}&request=${Date.now()}`

function overrideValue(override) {
  if (!override) return "auto"
  return override.released ? "released" : "unreleased"
}

export default function AdminPokedexAvailability() {
  const [catalog, setCatalog] = useState(null)
  const [overrides, setOverrides] = useState([])
  const [drafts, setDrafts] = useState({})
  const [sort, setSort] = useState("unreleased")
  const [query, setQuery] = useState("")
  const [onlyMismatches, setOnlyMismatches] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingDex, setSavingDex] = useState(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError("")
      try {
        const [catalogResponse, overridesResponse] = await Promise.all([
          fetch(buildCatalogRequestUrl(), {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          }),
          fetch(
            `/api/admin/pokemon-availability-overrides?request=${Date.now()}`,
            {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache" },
            }
          ),
        ])
        const [catalogData, overridesData] = await Promise.all([
          catalogResponse.json(),
          overridesResponse.json(),
        ])

        if (!catalogResponse.ok) {
          throw new Error(catalogData.error || "Unable to load Pokédex data")
        }
        if (!overridesResponse.ok) {
          throw new Error(overridesData.error || "Unable to load overrides")
        }

        setCatalog(catalogData)
        setOverrides(overridesData.overrides || [])
        setDrafts(
          Object.fromEntries(
            (overridesData.overrides || []).map((override) => [
              override.dexNumber,
              { status: overrideValue(override), note: override.note || "" },
            ])
          )
        )
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const rows = useMemo(() => {
    if (!catalog) return []

    const baseReleased =
      catalog.pogoApiReleasedDexNumbers || catalog.releasedDexNumbers || []
    const effectiveReleased = new Set(
      applyPokemonAvailabilityOverrides(baseReleased, overrides)
    )
    const baseSet = new Set(baseReleased.map(Number))
    const overrideMap = new Map(
      overrides.map((override) => [override.dexNumber, override])
    )
    const normalisedQuery = query.trim().toLowerCase()

    const values = catalog.regions.flatMap((region) =>
      region.pokemon.map((pokemon) => {
        const override = overrideMap.get(pokemon.dexNumber) || null
        const pogoApiReleased = baseSet.has(pokemon.dexNumber)
        const effective = effectiveReleased.has(pokemon.dexNumber)
        return {
          ...pokemon,
          region: region.region,
          override,
          pogoApiReleased,
          effectiveReleased: effective,
          mismatch: pogoApiReleased !== effective,
        }
      })
    )

    const filtered = values.filter((row) => {
      if (onlyMismatches && !row.mismatch) return false
      if (!normalisedQuery) return true
      return (
        row.name.toLowerCase().includes(normalisedQuery) ||
        String(row.dexNumber).includes(normalisedQuery) ||
        row.region.toLowerCase().includes(normalisedQuery)
      )
    })

    return sortPokemonAvailabilityRows(filtered, sort)
  }, [catalog, overrides, query, sort, onlyMismatches])

  const releasedCount = rows.filter((row) => row.effectiveReleased).length
  const unreleasedCount = rows.length - releasedCount

  const draftFor = (row) =>
    drafts[row.dexNumber] || {
      status: overrideValue(row.override),
      note: row.override?.note || "",
    }

  const updateDraft = (dexNumber, changes) => {
    setDrafts((current) => ({
      ...current,
      [dexNumber]: { ...(current[dexNumber] || {}), ...changes },
    }))
  }

  const saveOverride = async (row) => {
    const draft = draftFor(row)
    setSavingDex(row.dexNumber)
    setMessage("")
    try {
      if (draft.status === "auto") {
        const response = await fetch(
          `/api/admin/pokemon-availability-overrides?dexNumber=${row.dexNumber}`,
          { method: "DELETE" }
        )
        if (!response.ok && response.status !== 404) {
          const data = await response.json()
          throw new Error(data.error || "Unable to reset override")
        }
        setOverrides((current) =>
          current.filter((override) => override.dexNumber !== row.dexNumber)
        )
        setDrafts((current) => {
          const next = { ...current }
          delete next[row.dexNumber]
          return next
        })
        setMessage(`${row.name} now follows POGOAPI.`)
        return
      }

      const response = await fetch("/api/admin/pokemon-availability-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dexNumber: row.dexNumber,
          released: draft.status === "released",
          note: draft.note || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to save override")

      setOverrides((current) => [
        ...current.filter((override) => override.dexNumber !== row.dexNumber),
        data.override,
      ])
      setDrafts((current) => ({
        ...current,
        [row.dexNumber]: {
          status: overrideValue(data.override),
          note: data.override.note || "",
        },
      }))
      setMessage(
        `${row.name} marked ${data.override.released ? "released" : "unreleased"}.`
      )
    } catch (saveError) {
      setMessage(saveError.message)
    } finally {
      setSavingDex(null)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <h1>Pokédex availability</h1>
          <p>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container admin-pokedex-page">
      <div className="card admin-pokedex-hero">
        <div>
          <p><Link href="/admin">← Back to Admin Panel</Link></p>
          <h1>Pokédex availability overrides</h1>
          <p className="muted">
            POGOAPI supplies the default release status. An override wins until
            it is reset to “Use POGOAPI”.
          </p>
          {catalog?.checkedAt && (
            <p className="muted">
              POGOAPI last checked: {new Date(catalog.checkedAt).toLocaleString()}
            </p>
          )}
          {message && <p className="status-text">{message}</p>}
          {error && <p className="status-text">{error}</p>}
        </div>
      </div>

      <div className="card admin-pokedex-controls">
        <label>
          Search
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, number or region"
          />
        </label>
        <label>
          Sort
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="unreleased">Unreleased first</option>
            <option value="released">Released first</option>
            <option value="dex">National Dex order</option>
          </select>
        </label>
        <label className="admin-pokedex-checkbox">
          <input
            type="checkbox"
            checked={onlyMismatches}
            onChange={(event) => setOnlyMismatches(event.target.checked)}
          />
          Status changes only
        </label>
        <p className="muted admin-pokedex-summary">
          Showing {rows.length}: {releasedCount} released · {unreleasedCount} unreleased
        </p>
      </div>

      <div className="admin-pokedex-list">
        {rows.map((row) => {
          const draft = draftFor(row)
          return (
            <article
              className={`card admin-pokedex-row ${
                row.effectiveReleased ? "released" : "unreleased"
              }`}
              key={row.dexNumber}
            >
              <div className="admin-pokedex-name">
                <strong>
                  #{String(row.dexNumber).padStart(3, "0")} {row.name}
                </strong>
                <small>{row.region}</small>
              </div>
              <div className="admin-pokedex-statuses">
                <span>
                  POGOAPI: <strong>{row.pogoApiReleased ? "Released" : "Unreleased"}</strong>
                </span>
                <span>
                  Effective: <strong>{row.effectiveReleased ? "Released" : "Unreleased"}</strong>
                </span>
              </div>
              <label>
                Override
                <select
                  value={draft.status || "auto"}
                  onChange={(event) =>
                    updateDraft(row.dexNumber, { status: event.target.value })
                  }
                >
                  <option value="auto">Use POGOAPI</option>
                  <option value="released">Released</option>
                  <option value="unreleased">Unreleased</option>
                </select>
              </label>
              <label>
                Note
                <input
                  type="text"
                  maxLength={500}
                  value={draft.note || ""}
                  onChange={(event) =>
                    updateDraft(row.dexNumber, { note: event.target.value })
                  }
                  placeholder="Optional reason"
                />
              </label>
              <button
                type="button"
                onClick={() => saveOverride(row)}
                disabled={savingDex === row.dexNumber}
              >
                {savingDex === row.dexNumber ? "Saving…" : "Save"}
              </button>
            </article>
          )
        })}
      </div>

      <style jsx>{`
        .admin-pokedex-page { max-width: 1250px; }
        .admin-pokedex-hero h1 { margin-bottom: 8px; }
        .admin-pokedex-controls { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-bottom: 14px; }
        .admin-pokedex-controls label { display: grid; gap: 5px; font-weight: 700; }
        .admin-pokedex-controls input[type="search"] { min-width: 260px; }
        .admin-pokedex-checkbox { grid-auto-flow: column; align-items: center; }
        .admin-pokedex-summary { margin: 0 0 7px auto; }
        .admin-pokedex-list { display: grid; gap: 8px; }
        .admin-pokedex-row { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr) 160px minmax(180px, 1fr) auto; align-items: end; gap: 10px; padding: 12px; }
        .admin-pokedex-row.unreleased { border-left: 4px solid #d29922; }
        .admin-pokedex-row.released { border-left: 4px solid #2ea043; }
        .admin-pokedex-name { display: grid; gap: 3px; }
        .admin-pokedex-name small { color: #8b949e; }
        .admin-pokedex-statuses { display: grid; gap: 3px; font-size: 0.84rem; }
        .admin-pokedex-row label { display: grid; gap: 4px; font-size: 0.8rem; font-weight: 700; }
        @media (max-width: 950px) {
          .admin-pokedex-row { grid-template-columns: 1fr 1fr; }
          .admin-pokedex-row button { justify-self: start; }
          .admin-pokedex-summary { width: 100%; margin-left: 0; }
        }
        @media (max-width: 600px) {
          .admin-pokedex-controls, .admin-pokedex-row { display: grid; grid-template-columns: 1fr; }
          .admin-pokedex-controls input[type="search"] { min-width: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  if (!session || session.user.role !== "admin") {
    return { redirect: { destination: "/login", permanent: false } }
  }
  return { props: {} }
}
