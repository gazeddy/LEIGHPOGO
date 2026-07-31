import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/router"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"
import TradeListingForm from "../../components/TradeListingForm"
import { getEligibleTradeUser } from "../../lib/tradeServer"

export default function NewTradeListingPage() {
  const router = useRouter()
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createListing = async (payload) => {
    setError("")
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Unable to create trade listing")
      }

      router.push(`/trades/${data.id}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container">
      <div className="trade-back-link">
        <Link href="/trades">← Back to trades</Link>
      </div>
      <div className="card">
        <h1>Create trade listing</h1>
        <p className="muted">
          Your listing will expire automatically one month after it is created.
        </p>
      </div>

      <TradeListingForm
        onSubmit={createListing}
        submitLabel="Create listing"
        isSubmitting={isSubmitting}
      />

      {error && <p className="trade-error">{error}</p>}
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)

  if (!session) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  const tradeUser = await getEligibleTradeUser(session)

  if (!tradeUser) {
    return {
      redirect: { destination: "/friend-codes", permanent: false },
    }
  }

  return { props: {} }
}
