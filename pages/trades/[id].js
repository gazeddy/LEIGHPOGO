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
import {
  formatFriendCode,
  serializeTradeListing,
  tradeFriendshipRequirementLabel,
} from "../../lib/tradeUtils"

const attributeLabels = (item) => [
  item.shiny && "Shiny",
  item.lucky && "Lucky",
  item.xxl && "XXL",
  item.xxs && "XXS",
  item.costume && "Costume",
  item.background && "Special background",
  item.dynamax && "Dynamax",
  item.gigantamax && "Gigantamax",
].filter(Boolean)

function TradeItemList({ title, items }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">None specified.</p>
      ) : (
        <div className="trade-items">
          {items.map((item) => {
            const attributes = attributeLabels(item)

            return (
              <div className="trade-item" key={item.id}>
                <strong>{item.pokemonName}</strong>
                {attributes.length > 0 && (
                  <div className="trade-attributes">
                    {attributes.map((attribute) => (
                      <span className="trade-attribute" key={attribute}>
                        {attribute}
                      </span>
                    ))}
                  </div>
                )}
                {item.notes && <p className="muted">{item.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function TradeListingPage({ listing, viewer }) {
  const router = useRouter()
  const isOwner = viewer.id === listing.ownerId
  const canDelete = isOwner || viewer.role === "admin"
  const offeredItems = listing.items.filter((item) => item.direction === "OFFER")
  const wantedItems = listing.items.filter((item) => item.direction === "WANT")

  const closeListing = async () => {
    if (!window.confirm("Close this listing?")) return

    const response = await fetch(`/api/trades/${listing.id}`, {
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

  const deleteListing = async () => {
    if (!window.confirm("Permanently remove this trade listing?")) return

    const response = await fetch(`/api/trades/${listing.id}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const data = await response.json()
      window.alert(data.error || "Unable to remove listing")
      return
    }

    router.push("/trades")
  }

  return (
    <div className="container">
      <div className="trade-back-link">
        <Link href="/trades">← Back to trades</Link>
      </div>

      <div className="card trade-hero">
        <div>
          <h1>Trade listing #{listing.id}</h1>
          <p className="muted">
            Created by {listing.owner.ign} on{" "}
            {new Date(listing.createdAt).toLocaleDateString("en-GB")}
          </p>
          <p className="muted">
            Expires {new Date(listing.expiresAt).toLocaleDateString("en-GB")}
          </p>
        </div>
        <span className={`trade-status ${listing.status.toLowerCase()}`}>
          {listing.status}
        </span>
      </div>

      <div className="card">
        <h2>Trainer details</h2>
        <p><strong>In-game name:</strong> {listing.owner.ign}</p>
        <p>
          <strong>Friend code:</strong>{" "}
          <span className="entry-code">
            {formatFriendCode(listing.owner.friendCode) || "Unavailable"}
          </span>
        </p>
        <p>
          <strong>Friendship requirement:</strong>{" "}
          {tradeFriendshipRequirementLabel(listing.friendshipRequirement)}
        </p>
        {listing.location && (
          <p><strong>General location:</strong> {listing.location}</p>
        )}
      </div>

      <TradeItemList title="Pokémon offered" items={offeredItems} />
      <TradeItemList title="Pokémon wanted" items={wantedItems} />

      {listing.notes && (
        <section className="card">
          <h2>Listing notes</h2>
          <p className="trade-notes">{listing.notes}</p>
        </section>
      )}

      {canDelete && (
        <div className="card trade-card-actions">
          {isOwner && listing.status === "ACTIVE" && (
            <>
              <Link className="button-link secondary-button" href={`/trades/${listing.id}/edit`}>
                Edit listing
              </Link>
              <button type="button" className="danger" onClick={closeListing}>
                Close listing
              </button>
            </>
          )}
          <button type="button" className="danger" onClick={deleteListing}>
            Remove permanently
          </button>
        </div>
      )}
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

  await purgeExpiredTradeListings()

  const listingId = Number(context.params.id)

  if (!Number.isInteger(listingId)) {
    return { notFound: true }
  }

  const listing = await prisma.tradeListing.findUnique({
    where: { id: listingId },
    include: tradeListingInclude,
  })

  if (!listing) {
    return { notFound: true }
  }

  const canViewClosed =
    listing.ownerId === tradeUser.id || tradeUser.role === "admin"

  if (listing.status !== "ACTIVE" && !canViewClosed) {
    return { notFound: true }
  }

  return {
    props: {
      listing: serializeTradeListing(listing),
      viewer: {
        id: tradeUser.id,
        role: tradeUser.role,
      },
    },
  }
}
