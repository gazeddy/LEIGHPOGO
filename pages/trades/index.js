import Link from "next/link"
import { useRouter } from "next/router"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../api/auth/[...nextauth]"
import prisma from "../../lib/prisma"
import {
  getEligibleTradeUser,
  purgeExpiredTradeListings,
  tradeListingInclude,
} from "../../lib/tradeServer"
import { serializeTradeListing } from "../../lib/tradeUtils"

const itemNames = (listing, direction) =>
  listing.items
    .filter((item) => item.direction === direction)
    .map((item) => item.pokemonName)
    .join(", ")

function ListingCard({ listing, mine = false, onClose }) {
  return (
    <article className="card trade-listing-card">
      <div className="trade-section-header">
        <div>
          <h2>
            <Link href={`/trades/${listing.id}`}>Trade listing #{listing.id}</Link>
          </h2>
          <p className="muted">Listed by {listing.owner.ign}</p>
        </div>
        <span className={`trade-status ${listing.status.toLowerCase()}`}>
          {listing.status}
        </span>
      </div>

      <div className="trade-summary-grid">
        <div>
          <strong>Offering</strong>
          <p>{itemNames(listing, "OFFER")}</p>
        </div>
        <div>
          <strong>Wanted</strong>
          <p>{itemNames(listing, "WANT")}</p>
        </div>
      </div>

      {listing.location && <p className="muted">Location: {listing.location}</p>}
      <p className="muted">
        Expires {new Date(listing.expiresAt).toLocaleDateString("en-GB")}
      </p>

      <div className="trade-card-actions">
        <Link className="button-link" href={`/trades/${listing.id}`}>
          View listing
        </Link>
        {mine && listing.status === "ACTIVE" && (
          <>
            <Link className="button-link secondary-button" href={`/trades/${listing.id}/edit`}>
              Edit
            </Link>
            <button type="button" className="danger" onClick={() => onClose(listing.id)}>
              Close listing
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default function TradesPage({ requiresFriendCode, listings, myListings }) {
  const router = useRouter()

  const closeListing = async (listingId) => {
    if (!window.confirm("Close this listing? It will no longer appear in active trades.")) {
      return
    }

    const response = await fetch(`/api/trades/${listingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    })

    if (!response.ok) {
      const data = await response.json()
      window.alert(data.error || "Unable to close listing")
      return
    }

    router.replace(router.asPath)
  }

  if (requiresFriendCode) {
    return (
      <div className="container">
        <div className="card">
          <h1>Trade listings</h1>
          <p>
            You need a valid 12-digit Pokémon GO friend code saved to your account
            before you can view or create trade listings.
          </p>
          <div className="trade-card-actions">
            <Link className="button-link" href="/account">
              Add friend code
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card trade-hero">
        <div>
          <h1>Trade listings</h1>
          <p className="muted">
            Listings are private to registered traders and expire one month after creation.
          </p>
        </div>
        <Link className="button-link" href="/trades/new">
          Create listing
        </Link>
      </div>

      <section>
        <h2 className="trade-page-heading">Active listings</h2>
        {listings.length === 0 ? (
          <div className="card">
            <p className="muted">There are no active trade listings yet.</p>
          </div>
        ) : (
          listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))
        )}
      </section>

      <section>
        <h2 className="trade-page-heading">My listings</h2>
        {myListings.length === 0 ? (
          <div className="card">
            <p className="muted">You have not created any trade listings.</p>
          </div>
        ) : (
          myListings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              mine
              onClose={closeListing}
            />
          ))
        )}
      </section>
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
      props: {
        requiresFriendCode: true,
        listings: [],
        myListings: [],
      },
    }
  }

  await purgeExpiredTradeListings()
  const now = new Date()

  const [listings, myListings] = await Promise.all([
    prisma.tradeListing.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      include: tradeListingInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.tradeListing.findMany({
      where: {
        ownerId: tradeUser.id,
        expiresAt: { gt: now },
      },
      include: tradeListingInclude,
      orderBy: { createdAt: "desc" },
    }),
  ])

  return {
    props: {
      requiresFriendCode: false,
      listings: listings.map(serializeTradeListing),
      myListings: myListings.map(serializeTradeListing),
    },
  }
}
