import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const pad = (value) => String(value).padStart(2, "0")

function makeExpiry(year, month, day, hour, minute) {
  if (![year, month, day, hour, minute].every(value => value !== "" && Number.isInteger(Number(value)))) throw new Error("Select an expiry date and time.")
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  if (date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day) || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute)) throw new Error("Select a valid expiry date and time.")
  if (date <= new Date()) throw new Error("Expiry must be in the future.")
  return date.toISOString()
}
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"

export default function AdminGifts() {
  const [title, setTitle] = useState("")
  const [expiryYear, setExpiryYear] = useState("")
  const [expiryMonth, setExpiryMonth] = useState("")
  const [expiryDay, setExpiryDay] = useState("")
  const [expiryHour, setExpiryHour] = useState("23")
  const [expiryMinute, setExpiryMinute] = useState("59")
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [codes, setCodes] = useState("")
  const [codesFormat, setCodesFormat] = useState("text")
  const [selectedFile, setSelectedFile] = useState("")
  const [batches, setBatches] = useState([])
  const [audit, setAudit] = useState([])
  const [giftQr, setGiftQr] = useState(null)
  const [qrError, setQrError] = useState("")
  const [removalCodes, setRemovalCodes] = useState({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function refresh() {
    const response = await fetch("/api/admin/gifts")
    if (response.ok) setBatches(await response.json())
    const auditResponse = await fetch("/api/admin/gifts/audit", { cache: "no-store" })
    if (auditResponse.ok) setAudit(await auditResponse.json())
  }
  useEffect(() => {
    refresh()
    let mounted = true
    async function refreshQr() {
      try {
        const response = await fetch("/api/admin/gifts/qr", { cache: "no-store" })
        if (!response.ok) throw new Error("Unable to load current QR")
        const data = await response.json()
        if (mounted) { setGiftQr(data); setQrError("") }
      } catch (error) { if (mounted) setQrError(error.message) }
    }
    refreshQr()
    const timer = setInterval(refreshQr, 15000)
    const onFocus = () => refreshQr()
    window.addEventListener("focus", onFocus)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setExpiryYear(String(tomorrow.getFullYear()))
    setExpiryMonth(String(tomorrow.getMonth() + 1))
    setExpiryDay(String(tomorrow.getDate()))
    setCurrentYear(tomorrow.getFullYear())
    return () => { mounted = false; clearInterval(timer); window.removeEventListener("focus", onFocus) }
  }, [])
  const daysInMonth = expiryYear && expiryMonth ? new Date(Number(expiryYear), Number(expiryMonth), 0).getDate() : 31
  async function importCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError("")
    try {
      if (file.size > 1024 * 1024) throw new Error("CSV file must be 1 MB or smaller")
      const content = await file.text()
      setCodes(content)
      setCodesFormat("csv")
      setSelectedFile(file.name)
    } catch (error) {
      setError(error.message || "Unable to read CSV")
    }
  }
  async function upload(event) {
    event.preventDefault(); setError(""); setMessage("")
    if (!title.trim()) { setError("Enter a gift / event name."); return }
    if (!codes.trim()) { setError("Paste or upload at least one redemption code."); return }
    setBusy(true)
    try {
      const expiresAt = makeExpiry(expiryYear, expiryMonth, expiryDay, expiryHour, expiryMinute)
      const response = await fetch("/api/admin/gifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, expiresAt, codes, codesFormat }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Upload failed")
      setMessage("Created " + data.title + ". Its codes are now part of the shared gift QR pool.")
      setTitle(""); setCodes(""); setSelectedFile(""); setCodesFormat("text")
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function removeGiftCodes(payload, successLabel) {
    setError(""); setMessage(""); setBusy(true)
    try {
      const response = await fetch("/api/admin/gifts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to delete gift codes")
      setMessage(successLabel + ": " + result.deletedCodes + " code(s) removed. Claim audit preserved.")
      if (payload.mode === "codes") setRemovalCodes(previous => ({ ...previous, [payload.batchId]: "" }))
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function deleteBatch(batch) {
    const phrase = "DELETE " + batch.title
    const input = window.prompt(
      "Permanently remove batch \"" + batch.title + "\" and ALL " + batch.total +
      " codes, including " + batch.claimed + " claimed codes? The permanent claim audit remains intact.\n\nType " + phrase + " to confirm:",
      ""
    )
    if (input === null) return
    if (input !== phrase) { setError("Batch not deleted: confirmation did not match."); return }
    await removeGiftCodes({ mode: "batch", batchId: batch.id, confirmation: input }, "Batch deleted")
  }
  async function deleteSelectedCodes(batch) {
    const codes = removalCodes[batch.id] || ""
    const count = codes.split(/[\r\n,]+/).filter(code => code.trim()).length
    if (!count) { setError("Paste the exact test codes to remove first."); return }
    const input = window.prompt(
      "Permanently remove " + count + " exact code(s) from \"" + batch.title +
      "\"? The permanent claim audit will remain intact.\n\nType DELETE to confirm:",
      ""
    )
    if (input === null) return
    if (input !== "DELETE") { setError("Codes not deleted: confirmation did not match."); return }
    await removeGiftCodes({ mode: "codes", batchId: batch.id, codes, confirmation: input }, "Selected codes deleted")
  }
  return <main style={{ margin: "2rem auto", maxWidth: 900, padding: "0 1rem" }}>
    <h1>Community gift batches</h1>
    <p><Link href="/admin">Back to admin</Link></p>
    <form noValidate onSubmit={upload} style={{ display: "grid", gap: 12 }}>
      <label>Gift / event name <input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <fieldset style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <legend>Batch expiry (your local time)</legend>
        <label>Day
          <select aria-label="Expiry day" required value={expiryDay} onChange={e => setExpiryDay(e.target.value)}>
            <option value="">Day</option>
            {Array.from({ length: daysInMonth }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day}</option>)}
          </select>
        </label>
        <label>Month
          <select aria-label="Expiry month" required value={expiryMonth} onChange={e => { setExpiryMonth(e.target.value); if (expiryDay && Number(expiryDay) > new Date(Number(expiryYear), Number(e.target.value), 0).getDate()) setExpiryDay(String(new Date(Number(expiryYear), Number(e.target.value), 0).getDate())) }}>
            <option value="">Month</option>
            {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
        </label>
        <label>Year
          <select aria-label="Expiry year" required value={expiryYear} onChange={e => { setExpiryYear(e.target.value); if (expiryDay && expiryMonth && Number(expiryDay) > new Date(Number(e.target.value), Number(expiryMonth), 0).getDate()) setExpiryDay(String(new Date(Number(e.target.value), Number(expiryMonth), 0).getDate())) }}>
            <option value="">Year</option>
            {Array.from({ length: 5 }, (_, index) => currentYear + index).map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
        <label>Hour
          <select aria-label="Expiry hour" value={expiryHour} onChange={e => setExpiryHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={pad(hour)}>{pad(hour)}</option>)}
          </select>
        </label>
        <label>Minute
          <select aria-label="Expiry minute" value={expiryMinute} onChange={e => setExpiryMinute(e.target.value)}>
            {Array.from({ length: 60 }, (_, minute) => <option key={minute} value={pad(minute)}>{pad(minute)}</option>)}
          </select>
        </label>
      </fieldset>
      <label>Upload redemption codes CSV
        <input type="file" accept=".csv,text/csv" onChange={importCsv} />
      </label>
      {selectedFile && <p>Loaded CSV: {selectedFile}. Its codes will be imported into the selected batch.</p>}
      <label>Or paste redemption codes (one per line or comma-separated)
        <textarea required rows={8} value={codes} onChange={e => { setCodes(e.target.value); setCodesFormat("text"); setSelectedFile("") }} />
      </label>
      <button disabled={busy} type="submit">{busy ? "Adding codes…" : "Add codes to shared pool"}</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p>{message}</p>}
    <section style={{ border: "1px solid #888", borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h2>Rotating community gift QR</h2>
      <p>This QR and its link expire every 24 hours (at 00:00 UTC). A new QR is generated automatically; saved or printed copies stop working after the expiry. Claim limits remain one code per account per rolling 24 hours.</p>
      {qrError && <p role="alert" className="form-error">{qrError}</p>}
      {giftQr && <>
        <p>Expires: <strong>{new Date(giftQr.expiresAt).toLocaleString("en-GB")}</strong></p>
        <p style={{ overflowWrap: "anywhere" }}>
          <a href={giftQr.urlPath} target="_blank" rel="noreferrer">{typeof window !== "undefined" ? window.location.origin + giftQr.urlPath : giftQr.urlPath}</a>
        </p>
        <Image unoptimized
          key={giftQr.urlPath}
          src={"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "") + giftQr.urlPath)}
          alt="Current 24-hour LeighPogo community gift QR"
          width={240} height={240}
        />
        <p><a href={"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "") + giftQr.urlPath)} target="_blank" rel="noreferrer">Open current printable QR</a></p>
      </>}
      {!giftQr && !qrError && <p>Loading current QR…</p>}
    </section>
    <section style={{ border: "1px solid #888", borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h2>Permanent gift claim history</h2>
      <p>Latest 1,000 claims. Entries remain after account or batch deletion. Claim details are restricted to administrators.</p>
      <details>
        <summary>View recorded claims ({audit.length} shown)</summary>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Trainer IGN</th><th>Code issued</th><th>Batch</th><th>Claim time</th></tr></thead>
            <tbody>{audit.map(record => <tr key={record.id}>
              <td>{record.claimantIgn}</td>
              <td style={{ overflowWrap: "anywhere" }}>{record.code}</td>
              <td>{record.batchTitle}</td>
              <td>{new Date(record.claimedAt).toLocaleString("en-GB")}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
    <h2>Existing batches</h2>
    {batches.map(batch => <section key={batch.id} style={{ border: "1px solid #888", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3>{batch.title}</h3>
      <p>Expires {new Date(batch.expiresAt).toLocaleString("en-GB")} · Claimed {batch.claimed}/{batch.total} · Remaining {batch.total - batch.claimed}</p>
      <details><summary>Claimed by ({batch.claimants.length})</summary>
        <ul>{batch.claimants.map((claim, i) => <li key={i}>{claim.ign} — {new Date(claim.claimedAt).toLocaleString("en-GB")}</li>)}</ul>
      </details>
      <details style={{ marginTop: 12 }}>
        <summary>Remove specific test codes</summary>
        <p>Paste the exact codes to remove from this batch (comma-separated or one per line). The permanent claim audit and cooldown remain intact.</p>
        <textarea aria-label={"Codes to remove from " + batch.title} rows={3}
          value={removalCodes[batch.id] || ""}
          onChange={e => setRemovalCodes(previous => ({ ...previous, [batch.id]: e.target.value }))}
          style={{ display: "block", width: "100%", boxSizing: "border-box" }} />
        <button type="button" disabled={busy || !(removalCodes[batch.id] || "").trim()}
          onClick={() => deleteSelectedCodes(batch)}>Delete listed codes</button>
      </details>
      <p><button type="button" disabled={busy} onClick={() => deleteBatch(batch)}>
        Delete entire batch and all {batch.total} codes
      </button></p>
    </section>)}
  </main>
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  if (session?.user?.role !== "admin") return { redirect: { destination: "/", permanent: false } }
  return { props: {} }
}
