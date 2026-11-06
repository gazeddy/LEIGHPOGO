import Link from "next/link"
import { useEffect, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"

export default function CommunityGift() {
  const [gift, setGift] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function load(method = "GET") {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/gifts", { method })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to retrieve gift")
      setGift(data)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])
  return <main className="login-container" style={{ maxWidth: 540 }}>
    <h1>LeighPogo Community Gift</h1>
    <p>One gift per LeighPogo account. Available codes are allocated from the batch that expires soonest.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    {gift && (gift.claim ? <>
      <p>Your code from <strong>{gift.claim.batchTitle}</strong>:</p>
      <p><strong style={{ fontSize: "1.5em", overflowWrap: "anywhere" }}>{gift.claim.code}</strong></p>
      <p>Batch expiry: {new Date(gift.claim.expiresAt).toLocaleString("en-GB")}</p>
      <button onClick={() => navigator.clipboard?.writeText(gift.claim.code)}>Copy code</button>
      <p>Use the official Pokémon GO redemption process. LeighPogo records allocation, not in-game redemption.</p>
    </> : gift.remaining > 0 ?
      <button type="button" disabled={busy} onClick={() => load("POST")}>Claim my gift code</button>
      : <p>No unclaimed, unexpired gift codes are currently available.</p>
    )}
    {!gift && !error && <p>Loading…</p>}
    <p><Link href="/">Back to LeighPogo</Link></p>
  </main>
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  if (!session?.user?.id) return { redirect: { destination: "/login?next=%2Fgifts", permanent: false } }
  if (!session.user.privacyPolicyAccepted) return { redirect: { destination: "/privacy/accept?callbackUrl=%2Fgifts", permanent: false } }
  return { props: {} }
}
