import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/router"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../../api/auth/[...nextauth]"
import TradeListingForm from "../../../components/TradeListingForm"
import prisma from "../../../lib/prisma"
import {
  getEligibleTradeUser,
  purgeExpiredTradeListings,
  tradeListingInclude,
} from "../../../lib/tradeServer"
import { serializeTradeListing } from "../../../lib/tradeUtils"

export default function EditTradeListingPage({ listing }) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const initialValue = {
    location: listing.location || "",
    notes: listing.notes || "",
    offeredItems: listing.items.filter((item) => item.direction === "OFFER"),
    wantedItems: listing.items.filter((item) => item.direction === "WANT"),
  }

  const updateListing = async (payload) => {
    setError("")
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/trades/${listing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, status: "ACTIVE" }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Unable to update trade listing")
      }

      router.push(`/trades/${listing.id}`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container">
      <div className="trade-back-link">
        <Link href={`/trades/${listing.id}`}>← Back to listing</Link>
      </div>
      <div className="card">
        <h1>Edit trade listing #{listing.id}</h1>
        <p className="muted">
          Editing does not extend the original one-month expiry date.
        </p>
      </div>

      <TradeListingForm
        initialValue={initialValue}
        onSubmit={updateListing}
        submitLabel="Save changes"
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
      redirect: { destination: "/trades", permanent: false },
    }
  }

  await purgeExpiredTradeListings()

  const listingId = Number(context.params.id)

  if (!Number.isInteger(listingId)) {
    return { notFound: true }
  }

  const listing = await prisma.tradeListing.findUnique({
    where: { id: listingId },
    include: tradeListingInclude,
  })

  if (!listing || listing.ownerId !== tradeUser.id) {
    return { notFound: true }
  }

  if (listing.status !== "ACTIVE") {
    return {
      redirect: {
        destination: `/trades/${listing.id}`,
        permanent: false,
      },
    }
  }

  return {
    props: {
      listing: serializeTradeListing(listing),
    },
  }
}
