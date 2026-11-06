import Link from "next/link"
import { useEffect, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"

export default function AdminGifts() {
  const [title, setTitle] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [codes, setCodes] = useState("")
  const [batches, setBatches] = useState([])
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  async function refresh() {
    const response = await fetch("/api/admin/gifts")
    if (response.ok) setBatches(await response.json())
  }
  useEffect(() => { refresh() }, [])
  async function upload(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/admin/gifts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, expiresAt: new Date(expiresAt).toISOString(), codes }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Upload failed")
      setMessage("Created " + data.title + ". Your event QR is ready below.")
      setTitle(""); setCodes(""); setExpiresAt("")
      await refresh()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <main style={{ margin: "2rem auto", maxWidth: 900, padding: "0 1rem" }}>
    <h1>Community gift batches</h1>
    <p><Link href="/admin">Back to admin</Link></p>
    <form onSubmit={upload} style={{ display: "grid", gap: 12 }}>
      <label>Gift / event name <input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Batch expiry (local time) <input required type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
      <label>Redemption codes, one per line <textarea required rows={8} value={codes} onChange={e => setCodes(e.target.value)} /></label>
      <button disabled={busy || !expiresAt} type="submit">Create batch and QR</button>
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p>{message}</p>}
    <h2>Existing batches</h2>
    {batches.map(batch => {
      const url = typeof window !== "undefined" ? window.location.origin + "/gifts/" + batch.slug : "https://leighpogo.co.uk/gifts/" + batch.slug
      // Public event URLs only; the QR image carries no redemption code.
      const qr = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(url)
      return <section key={batch.id} style={{ border: "1px solid #888", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h3>{batch.title}</h3>
        <p>Expires {new Date(batch.expiresAt).toLocaleString("en-GB")} · Claimed {batch.claimed}/{batch.total} · Remaining {batch.total - batch.claimed}</p>
        <a href={url} target="_blank" rel="noreferrer">{url}</a>
        <div><img src={qr} width={200} height={200} alt={"Event QR for " + batch.title} /></div>
        <p><a href={qr} target="_blank" rel="noreferrer">Open printable QR image</a></p>
        <details><summary>Claimed by ({batch.claimants.length})</summary>
          <ul>{batch.claimants.map((claim, i) => <li key={i}>{claim.ign} — {new Date(claim.claimedAt).toLocaleString("en-GB")}</li>)}</ul>
        </details>
      </section>
    })}
  </main>
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  if (session?.user?.role !== "admin") return { redirect: { destination: "/", permanent: false } }
  return { props: {} }
}
