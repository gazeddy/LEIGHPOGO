import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/router"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./api/auth/[...nextauth]"
import prisma from "../lib/prisma"
import { purgeExpiredTradeListings } from "../lib/tradeServer"
import {
  serializeTradeNotification,
  tradeNotificationInclude,
} from "../lib/tradeNotifications"

const notificationMessage = (notification) => {
  const modifiers = notification.modifierSummary
    ? `${notification.modifierSummary} `
    : ""

  return `${notification.listing.owner.ign} listed ${modifiers}${notification.pokemonName}, matching your wanted list.`
}

export default function NotificationsPage({ initialNotifications }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initialNotifications)
  const unreadCount = notifications.filter((notification) => !notification.readAt).length

  const notifyNavbar = () => {
    window.dispatchEvent(new Event("trade-notifications-updated"))
  }

  const markAllRead = async () => {
    const response = await fetch("/api/notifications", { method: "PUT" })

    if (!response.ok) {
      window.alert("Unable to mark notifications as read.")
      return
    }

    const readAt = new Date().toISOString()
    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        readAt: notification.readAt || readAt,
      })),
    )
    notifyNavbar()
  }

  const openListing = async (notification) => {
    if (!notification.readAt) {
      const response = await fetch(`/api/notifications/${notification.id}`, {
        method: "PUT",
      })

      if (response.ok) {
        const updated = await response.json()
        setNotifications((current) =>
          current.map((item) => item.id === updated.id ? updated : item),
        )
        notifyNavbar()
      }
    }

    router.push(`/trades/${notification.listingId}`)
  }

  return (
    <div className="container notifications-page">
      <div className="card notifications-hero">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            Private alerts when another trainer offers something matching your wanted list.
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="secondary-button" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card">
          <p className="muted">You do not have any trade notifications yet.</p>
          <Link className="button-link" href="/trades/wanted">
            View wanted trades
          </Link>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => {
            const isAvailable =
              notification.listing.status === "ACTIVE" &&
              notification.listing.expiresAt &&
              new Date(notification.listing.expiresAt).getTime() > Date.now()

            return (
              <article
                className={`card notification-card ${notification.readAt ? "read" : "unread"}`}
                key={notification.id}
              >
                <div className="notification-card-main">
                  <div>
                    <div className="notification-title-row">
                      <h2>{notification.pokemonName}</h2>
                      {!notification.readAt && (
                        <span className="notification-unread-badge">New</span>
                      )}
                    </div>
                    <p>{notificationMessage(notification)}</p>
                    <p className="muted">
                      {new Date(notification.createdAt).toLocaleString("en-GB")}
                    </p>
                  </div>

                  {isAvailable ? (
                    <button type="button" onClick={() => openListing(notification)}>
                      View listing
                    </button>
                  ) : (
                    <span className="trade-status closed">Listing unavailable</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  const userId = Number(session?.user?.id)

  if (!Number.isInteger(userId)) {
    return {
      redirect: { destination: "/login", permanent: false },
    }
  }

  await purgeExpiredTradeListings()

  const notifications = await prisma.tradeNotification.findMany({
    where: { ownerId: userId },
    include: tradeNotificationInclude,
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return {
    props: {
      initialNotifications: notifications.map(serializeTradeNotification),
    },
  }
}
