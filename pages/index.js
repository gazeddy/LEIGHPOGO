import Head from "next/head"
import Link from "next/link"
import { getServerSession } from "next-auth/next"
import { getHomeCards } from "../lib/homeCards"
import { getCampfireUrl } from "../lib/siteSettings"
import { getEligibleTradeUser } from "../lib/tradeServer"
import styles from "../styles/HomeDashboard.module.css"
import { authOptions } from "./api/auth/[...nextauth]"

export default function Home({ isLoggedIn, isAdmin, hasFriendCode, campfireUrl }) {
  const cards = getHomeCards({ isLoggedIn, isAdmin, hasFriendCode, campfireUrl })

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
              key={card.title}
              href={card.href}
              className={`${styles.card} ${styles[card.tone]}`}
              target={card.external ? "_blank" : undefined}
              rel={card.external ? "noopener noreferrer" : undefined}
            >
              <div>
                <div className={styles.cardHeader}>
                  <span className={styles.label}>{card.label}</span>
                </div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
              <span className={styles.open}>
                {card.cta || "Open section"} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </section>

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
  const [session, campfireUrl] = await Promise.all([
    getServerSession(context.req, context.res, authOptions),
    getCampfireUrl(),
  ])
  const role = session?.user?.role
  const tradeUser = session ? await getEligibleTradeUser(session) : null

  return {
    props: {
      isLoggedIn: Boolean(session),
      isAdmin: role === "admin",
      hasFriendCode: Boolean(tradeUser),
      campfireUrl,
    },
  }
}
