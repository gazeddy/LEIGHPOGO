import Head from "next/head"
import Link from "next/link"
import { getServerSession } from "next-auth/next"
import { getHomeCards } from "../lib/homeCards"
import prisma from "../lib/prisma"
import {
  getEligibleTradeUser,
  purgeExpiredTradeListings,
  tradeListingInclude,
} from "../lib/tradeServer"
import { serializeTradeListing } from "../lib/tradeUtils"
import styles from "../styles/HomeDashboard.module.css"
import { authOptions } from "./api/auth/[...nextauth]"

const itemNames = (listing, direction) =>
  listing.items
    .filter((item) => item.direction === direction)
    .map((item) => item.pokemonName)
    .join(", ")

function HomeTradeListing({ listing }) {
  return (
    <article className={`card trade-listing-card ${styles.tradeListing}`}>
      <div className="trade-section-header">
        <div>
          <h3 className={styles.tradeTitle}>
            <Link href={`/trades/${listing.id}`}>Trade listing #{listing.id}</Link>
          </h3>
          <p className="muted">Listed by {listing.owner.ign}</p>
        </div>
        <span className="trade-status active">ACTIVE</span>
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
      </div>
    </article>
  )
}

export default function Home({ isLoggedIn, isAdmin, tradeListings }) {
  const cards = getHomeCards({ isLoggedIn, isAdmin })

  return (
    <>
      <Head>
        <title>Leigh Pokémon Go Community</title>
        <meta
          name="description"
          content="Friend codes, events, guides and community tools for Pokémon GO players around Leigh."
        />
      </Head>

      <main className={`container ${styles.page}`}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Leigh Pokémon GO Community</p>
          <h1>Community hub</h1>
          <p className={styles.intro}>
            Open the tools and information available to your account from one place.
          </p>
        </header>

        <section className={styles.grid} aria-label="Community sections">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`${styles.card} ${styles[card.tone]}`}
            >
              <div>
                <div className={styles.cardHeader}>
                  <span className={styles.label}>{card.label}</span>
                </div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
              <span className={styles.open}>Open section <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </section>

        {isLoggedIn && (
          <section className={styles.tradeSection} aria-labelledby="home-trade-listings">
            <div className={styles.tradeHeader}>
              <div>
                <p className={styles.eyebrow}>Registered members only</p>
                <h2 id="home-trade-listings">Active trade listings</h2>
                <p className={styles.tradeIntro}>
                  Browse current offers without leaving the community homepage.
                </p>
              </div>
              <div className="trade-card-actions">
                <Link className="button-link secondary-button" href="/trades">
                  View all trades
                </Link>
                <Link className="button-link" href="/trades/new">
                  Create listing
                </Link>
              </div>
            </div>

            {tradeListings.length === 0 ? (
              <div className={`card ${styles.emptyTrades}`}>
                <p className="muted">There are no active trade listings yet.</p>
              </div>
            ) : (
              <div className={styles.tradeList}>
                {tradeListings.map((listing) => (
                  <HomeTradeListing key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </section>
        )}

        {!isLoggedIn && (
          <p className={styles.loginNote}>
            <Link href="/login">Log in</Link> to unlock community guides and the private gym map.
          </p>
        )}
      </main>
    </>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  const role = session?.user?.role

  if (!session) {
    return {
      props: {
        isLoggedIn: false,
        isAdmin: false,
        tradeListings: [],
      },
    }
  }

  const tradeUser = await getEligibleTradeUser(session)

  if (!tradeUser) {
    return {
      redirect: { destination: "/friend-codes", permanent: false },
    }
  }

  await purgeExpiredTradeListings()
  const tradeListings = await prisma.tradeListing.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    include: tradeListingInclude,
    orderBy: { createdAt: "desc" },
  })

  return {
    props: {
      isLoggedIn: true,
      isAdmin: role === "admin",
      tradeListings: tradeListings.map(serializeTradeListing),
    },
  }
}
