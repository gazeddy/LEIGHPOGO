import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"

export default function GiftClaim() {
  const router = useRouter()
  const [gift, setGift] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const slug = typeof router.query.slug === "string" ? router.query.slug : ""
  async function load(method = "GET") {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/gifts/" + encodeURIComponent(slug), { method })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to retrieve gift")
      setGift(data)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { if (slug) load() }, [slug])
  return <main className="login-container" style={{ maxWidth: 540 }}>
    <h1>LeighPogo Community Gift</h1>
    {error && <p role="alert" className="form-error">{error}</p>}
    {gift && <>
      <h2>{gift.title}</h2>
      <p>Expires: {new Date(gift.expiresAt).toLocaleString("en-GB")}</p>
      {gift.claim ? <>
        <p>This code is reserved for your LeighPogo account.</p>
        <p><strong style={{ fontSize: "1.5em", overflowWrap: "anywhere" }}>{gift.claim.code}</strong></p>
        <button onClick={() => navigator.clipboard?.writeText(gift.claim.code)}>Copy redemption code</button>
        <p>Redeem using the official Pokémon GO redemption process. LeighPogo records code allocation, not in-game redemption.</p>
      </> : gift.expired ? <p>This gift batch has expired.</p>
      : gift.remaining === 0 ? <p>All codes in this batch have been claimed.</p>
      : <button type="button" disabled={busy} onClick={() => load("POST")}>Claim my gift code</button>}
    </>}
    {!gift && !error && <p>Loading gift...</p>}
    <p><Link href="/">Back to LeighPogo</Link></p>
  </main>
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  const slug = String(context.params.slug || "")
  const destination = "/gifts/" + encodeURIComponent(slug)
  if (!session) return { redirect: { destination: "/login?next=" + encodeURIComponent(destination), permanent: false } }
  if (!session.user.privacyPolicyAccepted) return { redirect: { destination: "/privacy/accept?callbackUrl=" + encodeURIComponent(destination), permanent: false } }
  return { props: {} }
}
