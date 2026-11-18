import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import { getServerSession } from "next-auth/next"
import { useState } from "react"
import { authOptions } from "../api/auth/[...nextauth]"
import prisma from "../../lib/prisma"
import {
  PRIVACY_POLICY_VERSION,
  hasCurrentPrivacyAcceptance,
} from "../../lib/privacyPolicy"

function safeCallbackUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/"
  }
  if (value.startsWith("/privacy/accept")) return "/"
  return value
}

export default function PrivacyAccept() {
  const router = useRouter()
  const { update } = useSession()
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const acceptPolicy = async (event) => {
    event.preventDefault()
    setError("")

    if (!acknowledged) {
      setError("Please confirm that you have read and understand the Privacy Policy.")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/privacy/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload.error || "Unable to record your acknowledgement.")
        return
      }

      await update({ privacyPolicyVersion: payload.policyVersion })
      await router.replace(safeCallbackUrl(router.query.callbackUrl))
    } catch {
      setError("Unable to record your acknowledgement. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="container privacy-gate">
      <Head>
        <title>Privacy Policy acknowledgement | LeighPogo</title>
      </Head>

      <section className="card privacy-gate-card">
        <h1>Privacy Policy update</h1>
        <p>
          Before continuing to LeighPogo, please read the current Privacy Policy. This acknowledgement is
          required for registered accounts using V4.
        </p>
        <p>
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">
            Read the LeighPogo Privacy Policy
          </Link>
        </p>

        <form onSubmit={acceptPolicy} className="stack">
          <label className="checkbox consent-checkbox">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>I have read and understand the LeighPogo Privacy Policy.</span>
          </label>

          <button type="submit" disabled={!acknowledged || submitting}>
            {submitting ? "Saving…" : "Accept and continue"}
          </button>
          {error && <p className="form-error">{error}</p>}
        </form>

        <p className="muted">Current policy version: {PRIVACY_POLICY_VERSION}</p>
      </section>
    </main>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session?.user?.id) {
    return {
      redirect: {
        destination: `/login?callbackUrl=${encodeURIComponent("/privacy/accept")}`,
        permanent: false,
      },
    }
  }

  const acceptance = await prisma.privacyAcceptance.findUnique({
    where: {
      ownerId_policyVersion: {
        ownerId: Number(session.user.id),
        policyVersion: PRIVACY_POLICY_VERSION,
      },
    },
    select: { policyVersion: true },
  })

  if (hasCurrentPrivacyAcceptance(acceptance?.policyVersion)) {
    return {
      redirect: { destination: "/", permanent: false },
    }
  }

  return { props: {} }
}
