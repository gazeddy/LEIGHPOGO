import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/router"
import { getServerSession } from "next-auth/next"
import { authOptions } from "./api/auth/[...nextauth]"
import prisma from "../lib/prisma"
import { purgeExpiredTradeListings } from "../lib/tradeServer"
import PushNotificationSettings from "../components/PushNotificationSettings"
import {
  serializeTradeNotification,
  tradeNotificationInclude,
} from "../lib/tradeNotifications"
import {
  friendCodeGrabNotificationInclude,
  serializeFriendCodeGrabNotification,
} from "../lib/friendCodeNotifications"

const notificationMessage = (notification) => {
  if (notification.kind === "FRIEND_CODE_GRAB") {
    const trainer = notification.copiedBy?.ign || "Another trainer"
    const codeOwner = notification.entry?.trainerName
      ? ` for ${notification.entry.trainerName}`
      : ""

    return `${trainer} copied your friend code${codeOwner}.`
  }

  const modifiers = notification.modifierSummary
    ? `${notification.modifierSummary} `
    : ""

  if (notification.type === "LISTING_MATCH") {
    const trainers = notification.matchedTrainerSummary || "Another trainer"
    const verb = notification.matchedTrainerCount === 1 ? "wants" : "want"

    return `${trainers} ${verb} ${modifiers}${notification.pokemonName}, which you have offered in this listing.`
  }

  return `${notification.listing.owner.ign} listed ${modifiers}${notification.pokemonName}, matching your wanted list.`
}

const notificationTitle = (notification) =>
  notification.kind === "FRIEND_CODE_GRAB"
    ? "Friend code copied"
    : notification.pokemonName

export default function NotificationsPage({ initialNotifications, renderedAt }) {
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

  const markNotificationRead = async (notification) => {
    if (notification.readAt) return notification

    const url =
      notification.kind === "FRIEND_CODE_GRAB"
        ? `/api/friend-code-grabs/${notification.id}`
        : `/api/notifications/${notification.id}`
    const response = await fetch(url, { method: "PUT" })

    if (!response.ok) return notification

    const updated = await response.json()
    const nextNotification =
      notification.kind === "FRIEND_CODE_GRAB"
        ? updated
        : { kind: "TRADE", ...updated }

    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id && item.kind === notification.kind
          ? nextNotification
          : item,
      ),
    )
    notifyNavbar()
    return nextNotification
  }

  const openTradeListing = async (notification) => {
    await markNotificationRead(notification)
    router.push(`/trades/${notification.listingId}`)
  }

  const openFriendCodes = async (notification) => {
    await markNotificationRead(notification)
    router.push("/friend-codes")
  }

  return (
    <div className="container notifications-page">
      <div className="card notifications-hero">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            Private alerts for trade matches and when another logged-in trainer copies your friend code. Friend-code copy alerts stay in-app only and are not sent as push notifications.
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="secondary-button" onClick={markAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <PushNotificationSettings />

      {notifications.length === 0 ? (
        <div className="card">
          <p className="muted">You do not have any notifications yet.</p>
          <Link className="button-link" href="/friend-codes">
            View friend codes
          </Link>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => {
            const isFriendCodeGrab = notification.kind === "FRIEND_CODE_GRAB"
            const isAvailable =
              !isFriendCodeGrab &&
              notification.listing.status === "ACTIVE" &&
              notification.listing.expiresAt &&
              new Date(notification.listing.expiresAt).getTime() > renderedAt

            return (
              <article
                className={`card notification-card ${notification.readAt ? "read" : "unread"}`}
                key={`${notification.kind}-${notification.id}`}
              >
                <div className="notification-card-main">
                  <div>
                    <div className="notification-title-row">
                      <h2>{notificationTitle(notification)}</h2>
                      {!notification.readAt && (
                        <span className="notification-unread-badge">New</span>
                      )}
                    </div>
                    <p>{notificationMessage(notification)}</p>
                    <p className="muted">
                      {new Date(notification.createdAt).toLocaleString("en-GB")}
                    </p>
                  </div>

                  {isFriendCodeGrab ? (
                    <button type="button" onClick={() => openFriendCodes(notification)}>
                      View friend codes
                    </button>
                  ) : isAvailable ? (
                    <button type="button" onClick={() => openTradeListing(notification)}>
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

  const [tradeNotifications, friendCodeNotifications] = await Promise.all([
    prisma.tradeNotification.findMany({
      where: { ownerId: userId },
      include: tradeNotificationInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.friendCodeGrabNotification.findMany({
      where: { ownerId: userId },
      include: friendCodeGrabNotificationInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  const notifications = [
    ...tradeNotifications.map((notification) => ({
      kind: "TRADE",
      ...serializeTradeNotification(notification),
    })),
    ...friendCodeNotifications.map(serializeFriendCodeGrabNotification),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)

  return {
    props: {
      initialNotifications: notifications,
      renderedAt: Date.now(),
    },
  }
}
