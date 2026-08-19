import Link from "next/link"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./api/auth/[...nextauth]"

const MAX_FILES = 20
const MAX_FILE_BYTES = 8 * 1024 * 1024
const POLL_INTERVAL_MS = 3000

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
    .pokedex-import-warning p { margin: 0; }
    .pokedex-import-warning .pokedex-import-actions { margin-top: 10px; }
    .pokedex-import-queue { display: grid; gap: 10px; }
    .pokedex-import-progress { width: 100%; height: 12px; accent-color: #2ea043; }
    .pokedex-import-confirm { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 12px; border: 1px solid #484f58; border-radius: 8px; }
    .pokedex-import-confirm input { width: 20px; height: 20px; margin-top: 2px; }
    .pokedex-import-success { border-color: #2ea043; background: rgba(46, 160, 67, 0.10); }
    .pokedex-import-secondary-note { margin: 0; }
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
      resolve({ name: file.name, type: file.type, data: value.slice(commaIndex + 1) })
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

function formatWait(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  if (value < 60) return `${Math.ceil(value)} sec`
  const minutes = Math.floor(value / 60)
  const remaining = Math.ceil(value % 60)
  return remaining ? `${minutes} min ${remaining} sec` : `${minutes} min`
}

function jobStatusText(job) {
  if (!job) return ""
  if (job.status === "QUEUED") {
    const wait = Number.isFinite(Number(job.estimatedWaitSeconds))
      ? ` · estimated wait ${formatWait(job.estimatedWaitSeconds)}`
      : ""
    return job.queuePosition
      ? `Queued · position ${job.queuePosition}${wait}`
      : `Queued for processing${wait}`
  }
  if (job.status === "PROCESSING") {
    return `Processing ${job.processedImages || 0} of ${job.totalImages} screenshots`
  }
  if (job.status === "COMPLETE") return "Processing complete · awaiting your review"
  if (job.status === "ACCEPTED") return "Accepted · stored screenshots deleted"
  if (job.status === "FAILED") return "Processing failed"
  return job.status
}

export default function PokedexImportPage() {
  const router = useRouter()
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState("")
  const [files, setFiles] = useState([])
  const [scanResults, setScanResults] = useState([])
  const [selectedMissing, setSelectedMissing] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [message, setMessage] = useState("")
  const [success, setSuccess] = useState(null)
  const [currentJob, setCurrentJob] = useState(null)
  const [pushEnabled, setPushEnabled] = useState(null)
  const [queueState, setQueueState] = useState(null)
  const [recentJobs, setRecentJobs] = useState([])
  const [queueAlertRegistered, setQueueAlertRegistered] = useState(false)
  const [queueAlertLoading, setQueueAlertLoading] = useState(false)

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [catalogResponse, pushResponse, queueResponse] = await Promise.all([
          fetch("/api/pokedex-catalog"),
          fetch("/api/push/subscription"),
          fetch("/api/pokedex-import/jobs"),
        ])

        const catalogData = await catalogResponse.json()
        if (!catalogResponse.ok) {
          throw new Error(catalogData.error || "Unable to load Pokédex data.")
        }
        setCatalog(catalogData)

        if (pushResponse.ok) {
          const pushData = await pushResponse.json()
          setPushEnabled(Array.isArray(pushData.subscriptions) && pushData.subscriptions.length > 0)
        }

        if (queueResponse.ok) {
          const queueData = await queueResponse.json()
          setQueueState(queueData.queue || null)
          setRecentJobs(Array.isArray(queueData.jobs) ? queueData.jobs : [])
          setQueueAlertRegistered(Boolean(queueData.queueAlertRegistered))
        }
      } catch (error) {
        setCatalogError(error.message)
      }
    }
    loadInitialData()
  }, [])

  const applyJobState = useCallback((job) => {
    setCurrentJob(job)

    if (job.status === "COMPLETE" && job.result) {
      const results = Array.isArray(job.result.results) ? job.result.results : []
      setScanResults(results)
      setSelectedMissing(new Set((job.result.likelyMissingDexNumbers || []).map(Number)))
      setAcknowledged(false)
      setSuccess(null)
      setMessage(
        `OCR finished. Review the missing selections below before applying import #${job.id}.`,
      )
    } else if (job.status === "ACCEPTED") {
      setScanResults([])
      setSelectedMissing(new Set())
      setAcknowledged(false)
      setSuccess({ accepted: true, cleanupPending: false })
      setMessage(`Import #${job.id} was already accepted and its stored screenshots were deleted.`)
    } else if (job.status === "FAILED") {
      setScanResults([])
      setSelectedMissing(new Set())
      setSuccess(null)
      setMessage(job.error || "The queued OCR job failed.")
    }
  }, [])

  const loadJob = useCallback(
    async (jobId) => {
      const response = await fetch(`/api/pokedex-import/jobs/${jobId}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to load the queued import.")

      let job = data.job
      applyJobState(job)

      if (
        ["COMPLETE", "FAILED"].includes(job.status) &&
        !job.notificationReadAt
      ) {
        const markResponse = await fetch(`/api/pokedex-import/jobs/${job.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "MARK_READ" }),
        }).catch(() => null)

        if (markResponse?.ok) {
          const marked = await markResponse.json().catch(() => ({}))
          job = {
            ...job,
            notificationReadAt: marked.notificationReadAt || new Date().toISOString(),
          }
          setCurrentJob(job)
          window.dispatchEvent(new Event("trade-notifications-updated"))
        }
      }

      return job
    },
    [applyJobState],
  )

  useEffect(() => {
    if (!router.isReady) return
    const rawJobId = Array.isArray(router.query.job) ? router.query.job[0] : router.query.job
    const jobId = Number(rawJobId)
    if (!Number.isInteger(jobId) || jobId <= 0) return

    loadJob(jobId).catch((error) => setMessage(error.message))
  }, [loadJob, router.isReady, router.query.job])

  useEffect(() => {
    if (!router.isReady || currentJob) return

    const rawJobId = Array.isArray(router.query.job) ? router.query.job[0] : router.query.job
    const queryJobId = Number(rawJobId)
    if (Number.isInteger(queryJobId) && queryJobId > 0) return

    const recoverable = recentJobs.find((job) =>
      ["COMPLETE", "PROCESSING", "QUEUED"].includes(job.status),
    )
    if (!recoverable) return

    router
      .replace(
        { pathname: "/pokedex-import", query: { job: recoverable.id } },
        undefined,
        { shallow: true },
      )
      .catch((error) => setMessage(error.message))
  }, [currentJob, recentJobs, router])

  useEffect(() => {
    if (!currentJob || !["QUEUED", "PROCESSING"].includes(currentJob.status)) return undefined

    const interval = window.setInterval(() => {
      loadJob(currentJob.id).catch((error) => setMessage(error.message))
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [currentJob, loadJob])

  const pokemonByDex = useMemo(() => {
    const map = new Map()
    for (const region of catalog?.regions || []) {
      for (const pokemon of region.pokemon || []) map.set(Number(pokemon.dexNumber), pokemon)
    }
    return map
  }, [catalog])

  const releasedSet = useMemo(
    () => new Set((catalog?.releasedDexNumbers || []).map(Number)),
    [catalog],
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
    releasedSet.has(dexNumber),
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
    setCurrentJob(null)

    if (router.query.job) {
      router.replace("/pokedex-import", undefined, { shallow: true })
    }

    if (selected.length > MAX_FILES) {
      setFiles([])
      setMessage(`Choose no more than ${MAX_FILES} screenshots at a time.`)
      event.target.value = ""
      return
    }

    const invalid = selected.find(
      (file) => !["image/png", "image/jpeg"].includes(file.type) || file.size > MAX_FILE_BYTES,
    )
    if (invalid) {
      setFiles([])
      setMessage("Screenshots must be PNG or JPEG files no larger than 8 MB each.")
      event.target.value = ""
      return
    }

    setFiles(selected)
  }

  const requestQueueAlert = async () => {
    setQueueAlertLoading(true)
    setMessage("")
    try {
      const response = await fetch("/api/pokedex-import/queue-alert", {
        method: "POST",
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Unable to register the queue notification.")
      }

      if (data.queue) setQueueState(data.queue)
      setPushEnabled(Boolean(data.pushEnabled))

      if (data.availableNow) {
        setQueueAlertRegistered(false)
        setMessage("The queue is available now. You can upload your screenshots.")
      } else {
        setQueueAlertRegistered(true)
        setMessage("Queue notification set. We'll send you a push as soon as uploads are available again.")
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setQueueAlertLoading(false)
    }
  }

  const queueScreenshots = async () => {
    if (!files.length) return

    setSubmitting(true)
    setMessage("")
    setSuccess(null)
    setAcknowledged(false)

    try {
      const preflightResponse = await fetch("/api/pokedex-import/jobs")
      const preflightData = await preflightResponse.json()
      if (!preflightResponse.ok) {
        throw new Error(preflightData.error || "Unable to check the Pokédex import queue.")
      }
      setQueueState(preflightData.queue || null)
      setQueueAlertRegistered(Boolean(preflightData.queueAlertRegistered))

      if (preflightData.queue && !preflightData.queue.acceptingUploads) {
        throw new Error(
          `The OCR queue is temporarily full enough to exceed the 2-minute wait target (about ${formatWait(preflightData.queue.estimatedWaitSeconds)}). Try again shortly.`,
        )
      }

      const images = []
      for (const file of files) images.push(await fileToPayload(file))

      const response = await fetch("/api/pokedex-import/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.queue) setQueueState(data.queue)
        throw new Error(data.error || "Unable to queue the screenshots.")
      }

      setCurrentJob(data.job)
      setQueueState(data.queue || null)
      setPushEnabled(Boolean(data.pushEnabled))
      setQueueAlertRegistered(Boolean(data.queueAlertRegistered))
      setFiles([])
      await router.replace(
        { pathname: "/pokedex-import", query: { job: data.job.id } },
        undefined,
        { shallow: true },
      )

      const wait = Number.isFinite(Number(data.job.estimatedWaitSeconds))
        ? ` Estimated wait: ${formatWait(data.job.estimatedWaitSeconds)}.`
        : ""
      setMessage(
        data.pushEnabled
          ? `Import #${data.job.id} is queued first-come-first-served.${wait} You can leave this page; a push notification will be sent when processing finishes.`
          : `Import #${data.job.id} is queued first-come-first-served.${wait} Push is not enabled for this account, so keep this page open or return later to review it.`,
      )
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
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

  const acceptAndDeleteScreenshots = async () => {
    if (!currentJob?.id) throw new Error("The completed import job could not be identified.")

    const response = await fetch(`/api/pokedex-import/jobs/${currentJob.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ACCEPT" }),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error || "Unable to delete the stored screenshots.")
    }

    setCurrentJob((previous) =>
      previous ? { ...previous, status: "ACCEPTED", notificationReadAt: new Date().toISOString() } : previous,
    )
    window.dispatchEvent(new Event("trade-notifications-updated"))
    return data
  }

  const retryScreenshotCleanup = async () => {
    setCleaningUp(true)
    setMessage("")
    try {
      await acceptAndDeleteScreenshots()
      setSuccess((previous) => ({ ...(previous || {}), cleanupPending: false }))
      setMessage("Stored screenshots deleted successfully.")
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCleaningUp(false)
    }
  }

  const applyImport = async () => {
    if (
      !acknowledged ||
      !catalog?.availabilityKnown ||
      !reviewedEntries.length ||
      currentJob?.status !== "COMPLETE"
    ) {
      return
    }

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

      const saved = {
        caughtCount: data.dexNumbers?.length || dexNumbers.length,
        missingCount: trackedMissingCount,
        removedWantedCount: Number(data.removedWantedCount || 0),
        cleanupPending: false,
      }

      try {
        await acceptAndDeleteScreenshots()
        setSuccess(saved)
        setMessage("Pokédex import applied successfully and the uploaded screenshots were deleted.")
      } catch (cleanupError) {
        setSuccess({ ...saved, cleanupPending: true })
        setMessage(
          `Pokédex progress was saved, but screenshot cleanup still needs to finish: ${cleanupError.message}`,
        )
      }
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
        <h2>2. Add screenshots to the queue</h2>
        <div className="pokedex-import-file">
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            onChange={chooseFiles}
            disabled={submitting || applying || cleaningUp}
          />
          <p className="muted">
            Up to {MAX_FILES} screenshots, 8 MB each per import. There is no per-account job cap: jobs are processed strictly first-come-first-served. New uploads are paused when the estimated wait would exceed 2 minutes.
          </p>
          <p className="muted">
            Uploaded screenshots stay on the server while you review the OCR result and are deleted as soon as you accept the import as correct.
          </p>
          {queueState && !queueState.acceptingUploads && (
            <div className="pokedex-import-warning">
              <p>
                Queue busy: estimated wait is about {formatWait(queueState.estimatedWaitSeconds)}. New uploads will be accepted again when the estimate falls to 2 minutes or less.
              </p>
              {pushEnabled ? (
                <div className="pokedex-import-actions">
                  <button
                    type="button"
                    onClick={requestQueueAlert}
                    disabled={queueAlertRegistered || queueAlertLoading}
                  >
                    {queueAlertRegistered
                      ? "Notification set"
                      : queueAlertLoading
                        ? "Setting notification…"
                        : "Notify me when I can upload"}
                  </button>
                </div>
              ) : (
                <p className="muted">
                  Enable push notifications from the Notifications page to get an alert when uploads reopen.
                </p>
              )}
            </div>
          )}
          {files.length > 0 && (
            <p>{files.length} screenshot{files.length === 1 ? "" : "s"} selected.</p>
          )}
          <div className="pokedex-import-actions">
            <button
              type="button"
              onClick={queueScreenshots}
              disabled={!files.length || submitting || applying || cleaningUp}
            >
              {submitting ? "Checking queue and uploading…" : "Queue screenshots"}
            </button>
          </div>
        </div>
        {message && <p className="status-text">{message}</p>}
      </div>

      {currentJob && ["QUEUED", "PROCESSING"].includes(currentJob.status) && (
        <div className="card pokedex-import-queue">
          <h2>Import #{currentJob.id}</h2>
          <strong>{jobStatusText(currentJob)}</strong>
          {currentJob.status === "PROCESSING" && (
            <progress
              className="pokedex-import-progress"
              value={currentJob.processedImages || 0}
              max={currentJob.totalImages || 1}
            />
          )}
          {pushEnabled ? (
            <p className="muted pokedex-import-secondary-note">
              You can close LEIGHPOGO. Your existing push subscription will notify you when this import is ready to review.
            </p>
          ) : (
            <p className="pokedex-import-warning">
              Push notifications are not enabled on this account. You can still leave and return to this import later, or enable push from the Notifications page.
            </p>
          )}
        </div>
      )}

      {currentJob?.status === "FAILED" && (
        <div className="card">
          <h2>Import #{currentJob.id} failed</h2>
          <p className="status-text">{currentJob.error || "The queued screenshots could not be processed."}</p>
          {currentJob.pushError && (
            <p className="pokedex-import-warning">
              Push notification was not delivered: {currentJob.pushError}
            </p>
          )}
          <p className="muted">Choose the screenshots again to create a new queue job.</p>
        </div>
      )}

      {currentJob?.status === "ACCEPTED" && scanResults.length === 0 && (
        <div className="card pokedex-import-success">
          <h2>Import #{currentJob.id} accepted</h2>
          <p className="status-text">The OCR result was accepted and the uploaded screenshots have been deleted from the server.</p>
        </div>
      )}

      {currentJob?.status === "COMPLETE" && (
        <div className="card">
          <h2>3. Review missing Pokémon</h2>
          {currentJob.pushError && (
            <p className="pokedex-import-warning">
              OCR finished, but the push notification was not delivered: {currentJob.pushError} The result is still available here and in Notifications.
            </p>
          )}
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

          {reviewedEntries.length === 0 ? (
            <p className="pokedex-import-warning">
              OCR completed but no numbered Pokédex entries were recognised. No changes can be accepted from this job. Upload clearer screenshots with the numbered grid visible and try again.
            </p>
          ) : (
            <>
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
                        disabled={!released || applying || cleaningUp}
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
                        <span className="pokedex-import-badge untracked">Not available</span>
                      )}
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {reviewedEntries.length > 0 && currentJob?.status === "COMPLETE" && (
        <div className={`card ${success ? "pokedex-import-success" : ""}`}>
          <h2>4. Apply import</h2>
          <p>
            This replaces your saved Pokédex progress. The {trackedMissingCount} released Pokémon selected above will remain missing; the other {proposedCaughtCount} released Pokémon will be marked caught.
          </p>

          <label className="pokedex-import-confirm">
            <input
              type="checkbox"
              checked={acknowledged}
              disabled={applying || cleaningUp || Boolean(success)}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I uploaded every Pokédex screen containing a Pokémon I have not caught, and I reviewed the missing selections above. Once accepted, the uploaded screenshots can be deleted.
            </span>
          </label>

          <div className="pokedex-import-actions pokedex-import-apply-actions">
            <button
              type="button"
              onClick={applyImport}
              disabled={!acknowledged || applying || cleaningUp || Boolean(success) || !catalog?.availabilityKnown}
            >
              {applying ? "Applying import…" : "Apply to my Pokédex"}
            </button>
            {success?.cleanupPending && (
              <button type="button" onClick={retryScreenshotCleanup} disabled={cleaningUp}>
                {cleaningUp ? "Deleting screenshots…" : "Delete stored screenshots"}
              </button>
            )}
            {success && !success.cleanupPending && (
              <Link className="button-link" href="/pokedex">
                View my Pokédex
              </Link>
            )}
          </div>

          {success?.caughtCount !== undefined && (
            <p className="status-text">
              Saved {success.caughtCount} caught Pokémon with {success.missingCount} released Pokémon left missing.
              {success.removedWantedCount
                ? ` Removed ${success.removedWantedCount} wanted ${success.removedWantedCount === 1 ? "listing" : "listings"} that are now caught.`
                : ""}
              {!success.cleanupPending ? " Uploaded screenshots deleted." : " Screenshot deletion is still pending."}
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
