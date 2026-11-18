import Link from "next/link"
import { useEffect, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"
import { validGiftQr } from "../../lib/giftQr"

export default function CommunityGift({ qrToken, invalidQr }) {
  const [gift, setGift] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function load(method = "GET") {
    setBusy(true); setError("")
    try {
      const response = await fetch(method === "GET" ? "/api/gifts?qr=" + encodeURIComponent(qrToken) : "/api/gifts", {
        method,
        ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qr: qrToken }) } : {}),
        cache: "no-store",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to retrieve gift")
      setGift(data)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { if (!invalidQr) load() }, [invalidQr, qrToken])
  return <main className="login-container" style={{ maxWidth: 540 }}>
    <h1>LeighPogo Community Gift</h1>
    <p>One code every 24 hours per LeighPogo account. Available codes come from the batch expiring soonest.</p>
    {invalidQr && <p role="alert" className="form-error">This gift QR has expired or is invalid. Please scan the current event QR code.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {gift && <>
      {gift.claim && <>
      <p>Your code from <strong>{gift.claim.batchTitle}</strong>:</p>
      <p><strong style={{ fontSize: "1.5em", overflowWrap: "anywhere" }}>{gift.claim.code}</strong></p>
      <p>Batch expiry: {new Date(gift.claim.expiresAt).toLocaleString("en-GB")}</p>
      <button onClick={() => navigator.clipboard?.writeText(gift.claim.code)}>Copy code</button>
      <p>
        <a href={gift.claim.redeemUrl}
          target="_blank" rel="noopener noreferrer">
          Redeem this code in Pokémon GO
        </a>
      </p>
      <button type="button" onClick={() => navigator.clipboard?.writeText(gift.claim.redeemUrl)}>Copy redemption link</button>
      <p>If your code is not filled automatically, copy it above and paste it into the official redemption page.</p>
      <p>Use the official Pokémon GO redemption process. LeighPogo records allocation, not in-game redemption.</p>
      </>}
      {!gift.canClaim && gift.nextClaimAt && <p>Your next code becomes available at <strong>{new Date(gift.nextClaimAt).toLocaleString("en-GB")}</strong> (24 hours after your last claim).</p>}
      {gift.canClaim && (gift.remaining > 0
        ? <button type="button" disabled={busy} onClick={() => load("POST")}>Claim today&apos;s code</button>
        : <p>No unclaimed, unexpired gift codes are currently available.</p>)}
    </>}
    {!invalidQr && !gift && !error && <p>Loading…</p>}
    <p><Link href="/">Back to LeighPogo</Link></p>
  </main>
}

export async function getServerSideProps(context) {
  context.res.setHeader("Cache-Control", "private, no-store")
  const qrToken = typeof context.query.qr === "string" ? context.query.qr : ""
  // Expired and legacy QR links cannot initiate claims, even after signing in.
  if (!validGiftQr(qrToken)) return { props: { qrToken: "", invalidQr: true } }
  const next = "/gifts?qr=" + encodeURIComponent(qrToken)
  const session = await getServerSession(context.req, context.res, authOptions)
  if (!session?.user?.id) return { redirect: { destination: "/login?next=" + encodeURIComponent(next), permanent: false } }
  if (!session.user.privacyPolicyAccepted) return { redirect: { destination: "/privacy/accept?callbackUrl=" + encodeURIComponent(next), permanent: false } }
  return { props: { qrToken, invalidQr: false } }
}
