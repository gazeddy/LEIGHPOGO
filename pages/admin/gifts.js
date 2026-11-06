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
  const [batches, setBatches] = useState([])
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function refresh() {
    const response = await fetch("/api/admin/gifts")
    if (response.ok) setBatches(await response.json())
  }
  useEffect(() => {
    refresh()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setExpiryYear(String(tomorrow.getFullYear()))
    setExpiryMonth(String(tomorrow.getMonth() + 1))
    setExpiryDay(String(tomorrow.getDate()))
    setCurrentYear(tomorrow.getFullYear())
  }, [])
  const daysInMonth = expiryYear && expiryMonth ? new Date(Number(expiryYear), Number(expiryMonth), 0).getDate() : 31
  async function upload(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("")
    try {
      const expiresAt = makeExpiry(expiryYear, expiryMonth, expiryDay, expiryHour, expiryMinute)
      const response = await fetch("/api/admin/gifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, expiresAt, codes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Upload failed")
      setMessage("Created " + data.title + ". Its codes are now part of the shared gift QR pool.")
      setTitle(""); setCodes("")
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <main style={{ margin: "2rem auto", maxWidth: 900, padding: "0 1rem" }}>
    <h1>Community gift batches</h1>
    <p><Link href="/admin">Back to admin</Link></p>
    <form onSubmit={upload} style={{ display: "grid", gap: 12 }}>
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
          <select aria-label="Expiry month" required value={expiryMonth} onChange={e => { setExpiryMonth(e.target.value); setExpiryDay("") }}>
            <option value="">Month</option>
            {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
          </select>
        </label>
        <label>Year
          <select aria-label="Expiry year" required value={expiryYear} onChange={e => { setExpiryYear(e.target.value); setExpiryDay("") }}>
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
      <label>Redemption codes, one per line <textarea required rows={8} value={codes} onChange={e => setCodes(e.target.value)} /></label>
      <button disabled={busy || !expiryYear || !expiryMonth || !expiryDay} type="submit">Add codes to shared pool</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p>{message}</p>}
    <section style={{ border: "1px solid #888", borderRadius: 8, padding: 16, marginBottom: 20 }}>
      <h2>One QR for all gift batches</h2>
      <p>Print this QR once. All batches share this link; the soonest-expiring available codes are issued first. Each member can claim one code every rolling 24 hours, with the earliest-expiring available codes issued first.</p>
      <p><a href="/gifts" target="_blank" rel="noreferrer">{typeof window !== "undefined" ? window.location.origin + "/gifts" : "https://leighpogo.co.uk/gifts"}</a></p>
      <Image unoptimized
        src={"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "https://leighpogo.co.uk") + "/gifts")}
        alt="Shared LeighPogo community gift QR"
        width={240} height={240}
      />
      <p><a href={"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent((typeof window !== "undefined" ? window.location.origin : "https://leighpogo.co.uk") + "/gifts")} target="_blank" rel="noreferrer">Open printable shared QR</a></p>
    </section>
    <h2>Existing batches</h2>
    {batches.map(batch => <section key={batch.id} style={{ border: "1px solid #888", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3>{batch.title}</h3>
      <p>Expires {new Date(batch.expiresAt).toLocaleString("en-GB")} · Claimed {batch.claimed}/{batch.total} · Remaining {batch.total - batch.claimed}</p>
      <details><summary>Claimed by ({batch.claimants.length})</summary>
        <ul>{batch.claimants.map((claim, i) => <li key={i}>{claim.ign} — {new Date(claim.claimedAt).toLocaleString("en-GB")}</li>)}</ul>
      </details>
    </section>)}
  </main>
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  if (session?.user?.role !== "admin") return { redirect: { destination: "/", permanent: false } }
  return { props: {} }
}
