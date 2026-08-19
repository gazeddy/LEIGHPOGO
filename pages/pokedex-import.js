import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./api/auth/[...nextauth]"

const MAX_FILES = 20
const MAX_FILE_BYTES = 8 * 1024 * 1024

function PokedexImportStyles() {
  return <style jsx global>{`
    .pokedex-import-page { max-width: 980px; }
    .pokedex-import-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; }
    .pokedex-import-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .pokedex-import-steps { margin: 12px 0 0; padding-left: 20px; }
    .pokedex-import-steps li + li { margin-top: 7px; }
    .pokedex-import-file { display: grid; gap: 8px; }
    .pokedex-import-file input[type="file"] { width: 100%; }
    .pokedex-import-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 12px; }
    .pokedex-import-stat { display: grid; gap: 3px; padding: 10px 12px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; }
    .pokedex-import-stat strong { font-size: 1.15rem; }
    .pokedex-import-stat span { color: #8b949e; font-size: 0.78rem; }
    .pokedex-import-review { display: grid; gap: 8px; margin-top: 14px; }
    .pokedex-import-entry { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; }
    .pokedex-import-entry input { width: 20px; height: 20px; accent-color: #f85149; }
    .pokedex-import-entry-main { display: grid; gap: 3px; min-width: 0; }
    .pokedex-import-entry-title { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .pokedex-import-entry-title strong { overflow-wrap: anywhere; }
    .pokedex-import-entry-meta { color: #8b949e; font-size: 0.74rem; }
    .pokedex-import-badge { display: inline-flex; padding: 5px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 800; white-space: nowrap; }
    .pokedex-import-badge.missing { border: 1px solid #f85149; color: #ffb3ad; background: rgba(248, 81, 73, 0.12); }
    .pokedex-import-badge.uncertain { border: 1px solid #d29922; color: #f0c36b; background: rgba(210, 153, 34, 0.12); }
    .pokedex-import-badge.caught { border: 1px solid #2ea043; color: #7ee787; background: rgba(46, 160, 67, 0.12); }
    .pokedex-import-badge.untracked { border: 1px solid #6e7681; color: #c9d1d9; background: rgba(110, 118, 129, 0.12); }
    .pokedex-import-warning { padding: 10px 12px; border: 1px solid #d29922; border-radius: 8px; background: rgba(210, 153, 34, 0.08); }
    .pokedex-import-confirm { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 12px; border: 1px solid #484f58; border-radius: 8px; }
    .pokedex-import-confirm input { width: 20px; height: 20px; margin-top: 2px; }
    .pokedex-import-success { border-color: #2ea043; background: rgba(46, 160, 67, 0.10); }
    @media (max-width: 680px) {
      .pokedex-import-hero { grid-template-columns: 1fr; }
      .pokedex-import-entry { grid-template-columns: auto minmax(0, 1fr); }
      .pokedex-import-entry > .pokedex-import-badge { grid-column: 2; justify-self: start; }
    }
  `}</style>
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`))
    reader.onload = () => {
      const value = String(reader.result || "")
      const commaIndex = value.indexOf(",")
      if (commaIndex < 0) {
        reject(new Error(`Unable to encode ${file.name}.`))
        return
      }
      resolve({
        name: file.name,
        type: file.type,
        data: value.slice(commaIndex + 1),
      })
    }
    reader.readAsDataURL(file)
  })
}

function classificationRank(classification) {
  if (classification === "missing") return 3
  if (classification === "uncertain") return 2
  return 1
}

function classificationLabel(classification) {
  if (classification === "missing") return "Likely missing"
  if (classification === "uncertain") return "Check manually"
  return "Looks caught"
}

export default function PokedexImportPage() {
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState("")
  const [files, setFiles] = useState([])
  const [scanResults, setScanResults] = useState([])
  const [selectedMissing, setSelectedMissing] = useState(new Set())
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [message, setMessage] = useState("")
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const response = await fetch("/api/pokedex-catalog")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Unable to load Pokédex data.")
        setCatalog(data)
      } catch (error) {
        setCatalogError(error.message)
      }
    }
    loadCatalog()
  }, [])

  const pokemonByDex = useMemo(() => {
    const map = new Map()
    for (const region of catalog?.regions || []) {
      for (const pokemon of region.pokemon || []) {
        map.set(Number(pokemon.dexNumber), pokemon)
      }
    }
    return map
  }, [catalog])

  const releasedSet = useMemo(
    () => new Set((catalog?.releasedDexNumbers || []).map(Number)),
    [catalog]
  )

  const reviewedEntries = useMemo(() => {
    const merged = new Map()

    for (const result of scanResults) {
      for (const entry of result.entries || []) {
        const dexNumber = Number(entry.dexNumber)
        if (!Number.isInteger(dexNumber) || dexNumber <= 0) continue

        const current = merged.get(dexNumber)
        if (!current) {
          merged.set(dexNumber, { ...entry, dexNumber, sources: [result.name] })
          continue
        }

        const sources = Array.from(new Set([...current.sources, result.name]))
        if (classificationRank(entry.classification) > classificationRank(current.classification)) {
          merged.set(dexNumber, { ...entry, dexNumber, sources })
        } else {
          merged.set(dexNumber, { ...current, sources })
        }
      }
    }

    return Array.from(merged.values()).sort((left, right) => left.dexNumber - right.dexNumber)
  }, [scanResults])

  const trackedMissingCount = Array.from(selectedMissing).filter((dexNumber) =>
    releasedSet.has(dexNumber)
  ).length
  const proposedCaughtCount = Math.max(0, releasedSet.size - trackedMissingCount)
  const warnings = scanResults.filter((result) => result.warning)

  const chooseFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    setMessage("")
    setSuccess(null)
    setScanResults([])
    setSelectedMissing(new Set())
    setAcknowledged(false)

    if (selected.length > MAX_FILES) {
      setFiles([])
      setMessage(`Choose no more than ${MAX_FILES} screenshots at a time.`)
      event.target.value = ""
      return
    }

    const invalid = selected.find(
      (file) =>
        !["image/png", "image/jpeg"].includes(file.type) || file.size > MAX_FILE_BYTES
    )
    if (invalid) {
      setFiles([])
      setMessage("Screenshots must be PNG or JPEG files no larger than 8 MB each.")
      event.target.value = ""
      return
    }

    setFiles(selected)
  }

  const scanScreenshots = async () => {
    if (!files.length) return

    setScanning(true)
    setMessage("")
    setSuccess(null)
    setAcknowledged(false)
    try {
      const images = []
      for (const file of files) images.push(await fileToPayload(file))

      const response = await fetch("/api/pokedex-import/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to scan the screenshots.")

      const results = Array.isArray(data.results) ? data.results : []
      setScanResults(results)
      setSelectedMissing(new Set((data.likelyMissingDexNumbers || []).map(Number)))

      const recognised = new Set(
        results.flatMap((result) => (result.entries || []).map((entry) => Number(entry.dexNumber)))
      ).size
      setMessage(
        recognised
          ? `OCR recognised ${recognised} Pokédex entries. Review the missing boxes before applying the import.`
          : "No Pokédex entries were recognised. Try a clearer screenshot with the numbered grid visible."
      )
    } catch (error) {
      setScanResults([])
      setSelectedMissing(new Set())
      setMessage(error.message)
    } finally {
      setScanning(false)
    }
  }

  const toggleMissing = (dexNumber) => {
    if (!releasedSet.has(dexNumber)) return
    setSelectedMissing((previous) => {
      const next = new Set(previous)
      next.has(dexNumber) ? next.delete(dexNumber) : next.add(dexNumber)
      return next
    })
    setAcknowledged(false)
  }

  const applyImport = async () => {
    if (!acknowledged || !catalog?.availabilityKnown || !reviewedEntries.length) return

    setApplying(true)
    setMessage("")
    setSuccess(null)
    try {
      const dexNumbers = Array.from(releasedSet)
        .filter((dexNumber) => !selectedMissing.has(dexNumber))
        .sort((left, right) => left - right)

      const response = await fetch("/api/pokedex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dexNumbers }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to apply the Pokédex import.")

      setSuccess({
        caughtCount: data.dexNumbers?.length || dexNumbers.length,
        missingCount: trackedMissingCount,
        removedWantedCount: Number(data.removedWantedCount || 0),
      })
      setMessage("Pokédex import applied successfully.")
    } catch (error) {
      setMessage(error.message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="container pokedex-import-page">
      <div className="card pokedex-import-hero">
        <div>
          <h1>Import Pokédex screenshots</h1>
          <p className="muted">
            Upload only Pokédex screens that contain at least one Pokémon you have not caught.
            Everything else that is currently released will be assumed caught.
          </p>
        </div>
        <Link className="button-link secondary-button" href="/pokedex">
          Back to Pokédex
        </Link>
      </div>

      <div className="card">
        <h2>1. Take the screenshots</h2>
        <ol className="pokedex-import-steps">
          <li>Scroll through the Pokémon GO Pokédex.</li>
          <li>Screenshot only screens containing at least one missing Pokémon.</li>
          <li>Seen-but-not-caught silhouettes count as missing too.</li>
          <li>Keep the numbered Pokédex grid visible; PNG or JPEG screenshots work best.</li>
        </ol>
      </div>

      <div className="card">
        <h2>2. Upload and scan</h2>
        <div className="pokedex-import-file">
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            onChange={chooseFiles}
            disabled={scanning || applying}
          />
          <p className="muted">
            Up to {MAX_FILES} screenshots, 8 MB each. OCR jobs are processed one at a time to keep server load low.
          </p>
          {files.length > 0 && <p>{files.length} screenshot{files.length === 1 ? "" : "s"} selected.</p>}
          <div className="pokedex-import-actions">
            <button type="button" onClick={scanScreenshots} disabled={!files.length || scanning || applying}>
              {scanning ? `Scanning ${files.length} screenshot${files.length === 1 ? "" : "s"}…` : "Scan screenshots"}
            </button>
          </div>
        </div>
        {message && <p className="status-text">{message}</p>}
      </div>

      {scanResults.length > 0 && (
        <div className="card">
          <h2>3. Review missing Pokémon</h2>
          {!catalog?.availabilityKnown && (
            <p className="pokedex-import-warning">
              Pokémon release status is currently unavailable. The import cannot be applied safely until it is available again.
            </p>
          )}
          {warnings.map((result) => (
            <p className="pokedex-import-warning" key={result.name}>
              {result.name}: {result.warning}
            </p>
          ))}

          <div className="pokedex-import-summary">
            <div className="pokedex-import-stat">
              <strong>{reviewedEntries.length}</strong>
              <span>entries recognised</span>
            </div>
            <div className="pokedex-import-stat">
              <strong>{trackedMissingCount}</strong>
              <span>released Pokémon marked missing</span>
            </div>
            <div className="pokedex-import-stat">
              <strong>{proposedCaughtCount}</strong>
              <span>released Pokémon assumed caught</span>
            </div>
          </div>

          <p className="muted">
            Tick Missing for anything you have not caught. OCR suggestions are only a starting point; silhouettes can be harder to classify than empty tiles.
          </p>

          <div className="pokedex-import-review">
            {reviewedEntries.map((entry) => {
              const pokemon = pokemonByDex.get(entry.dexNumber)
              const released = releasedSet.has(entry.dexNumber)
              return (
                <label className="pokedex-import-entry" key={entry.dexNumber}>
                  <input
                    type="checkbox"
                    checked={released && selectedMissing.has(entry.dexNumber)}
                    disabled={!released || applying}
                    onChange={() => toggleMissing(entry.dexNumber)}
                    aria-label={`Mark ${pokemon?.name || `#${entry.dexNumber}`} as missing`}
                  />
                  <span className="pokedex-import-entry-main">
                    <span className="pokedex-import-entry-title">
                      <strong>{pokemon?.name || "Pokémon"}</strong>
                      <span className="dex-number">#{String(entry.dexNumber).padStart(3, "0")}</span>
                    </span>
                    <span className="pokedex-import-entry-meta">
                      {entry.reason || "OCR result"} · {entry.sources.join(", ")}
                    </span>
                  </span>
                  {released ? (
                    <span className={`pokedex-import-badge ${entry.classification}`}>
                      {classificationLabel(entry.classification)}
                    </span>
                  ) : (
                    <span className="pokedex-import-badge untracked">Not currently tracked</span>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {reviewedEntries.length > 0 && (
        <div className={`card ${success ? "pokedex-import-success" : ""}`}>
          <h2>4. Apply import</h2>
          <p>
            This replaces your saved Pokédex progress. The {trackedMissingCount} released Pokémon selected above will remain missing;
            the other {proposedCaughtCount} released Pokémon will be marked caught.
          </p>

          <label className="pokedex-import-confirm">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={applying || Boolean(success)}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I uploaded every Pokédex screen containing a Pokémon I have not caught, and I reviewed the missing selections above.
            </span>
          </label>

          <div className="pokedex-import-actions" style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={applyImport}
              disabled={
                !acknowledged ||
                applying ||
                Boolean(success) ||
                !catalog?.availabilityKnown
              }
            >
              {applying ? "Applying import…" : "Apply to my Pokédex"}
            </button>
            {success && (
              <Link className="button-link" href="/pokedex">
                View my Pokédex
              </Link>
            )}
          </div>

          {success && (
            <p className="status-text">
              Saved {success.caughtCount} caught Pokémon with {success.missingCount} released Pokémon left missing.
              {success.removedWantedCount
                ? ` Removed ${success.removedWantedCount} wanted ${success.removedWantedCount === 1 ? "listing" : "listings"} that are now caught.`
                : ""}
            </p>
          )}
        </div>
      )}

      {catalogError && <div className="card"><p className="status-text">{catalogError}</p></div>}
      <PokedexImportStyles />
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session) {
    const callbackUrl = encodeURIComponent(context.resolvedUrl || "/pokedex-import")
    return {
      redirect: {
        destination: `/login?callbackUrl=${callbackUrl}`,
        permanent: false,
      },
    }
  }

  return { props: {} }
}
