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

const POKEDEX_NOTIFICATION_STATUSES = ["COMPLETE", "FAILED", "ACCEPTED"]
const NOTIFICATION_LIST_LIMIT = 20

const serializePokedexImportNotification = (job) => ({
  kind: "POKEDEX_IMPORT",
  id: job.id,
  jobId: job.id,
  status: job.status,
  totalImages: job.totalImages,
  error: job.error,
  pushError: job.pushError,
  createdAt: (job.completedAt || job.createdAt).toISOString(),
  readAt: job.notificationReadAt?.toISOString() || null,
})

const notificationMessage = (notification) => {
  if (notification.kind === "POKEDEX_IMPORT") {
    if (notification.status === "FAILED") {
      return notification.error
        ? `Your Pokédex screenshot import could not be processed: ${notification.error}`
        : "Your Pokédex screenshot import could not be processed."
    }

    if (notification.status === "ACCEPTED") {
      return `Pokédex import #${notification.jobId} was accepted and its uploaded screenshots were deleted.`
    }

    const count = Number(notification.totalImages) || 0
    return `${count} Pokédex screenshot${count === 1 ? " has" : "s have"} been processed and ${count === 1 ? "is" : "are"} ready to review.`
  }

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

const notificationTitle = (notification) => {
  if (notification.kind === "POKEDEX_IMPORT") {
    if (notification.status === "FAILED") return "Pokédex import failed"
    if (notification.status === "ACCEPTED") return "Pokédex import accepted"
    return "Pokédex import ready"
  }

  return notification.kind === "FRIEND_CODE_GRAB"
    ? "Friend code copied"
    : notification.pokemonName
}

export default function NotificationsPage({ initialNotifications, renderedAt }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [isClearing, setIsClearing] = useState(false)
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

  const closeDisplayedPushNotifications = async () => {
    try {
      if (!("serviceWorker" in navigator)) return
      const registration = await navigator.serviceWorker.ready
      if (typeof registration.getNotifications !== "function") return
      const displayed = await registration.getNotifications()
      displayed.forEach((notification) => notification.close())
    } catch {
      // Closing already displayed OS notifications is best-effort only.
    }
  }

  const clearNotifications = async () => {
    if (
      !window.confirm(
        "Clear all notifications? Trade and friend-code notifications will simply be removed. Pokédex import notifications that have not been opened will also be permanently deleted; if one of those imports changed your Pokédex, those Pokédex changes will be undone and any Wanted Trades automatically removed by that import will be restored. This cannot be undone.",
      )
    ) {
      return
    }

    setIsClearing(true)

    try {
      const response = await fetch("/api/notifications", { method: "DELETE" })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        window.alert(data.error || "Unable to clear notifications.")
        return
      }

      setNotifications([])
      await closeDisplayedPushNotifications()

      try {
        if (typeof navigator.clearAppBadge === "function") {
          await navigator.clearAppBadge()
        } else if (typeof navigator.setAppBadge === "function") {
          await navigator.setAppBadge(0)
        }
      } catch {
        // App badging is optional and must not block clearing the inbox.
      }

      notifyNavbar()
    } finally {
      setIsClearing(false)
    }
  }

  const consumeNotification = async (notification) => {
    let response

    if (notification.kind === "POKEDEX_IMPORT") {
      response = await fetch(`/api/pokedex-import/jobs/${notification.jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DISMISS_NOTIFICATION" }),
      })
    } else {
      const url =
        notification.kind === "FRIEND_CODE_GRAB"
          ? `/api/friend-code-grabs/${notification.id}`
          : `/api/notifications/${notification.id}`
      response = await fetch(url, { method: "DELETE" })
    }

    if (!response.ok) return false

    setNotifications((current) =>
      current.filter(
        (item) =>
          !(item.id === notification.id && item.kind === notification.kind),
      ),
    )
    notifyNavbar()
    return true
  }

  const openTradeListing = async (notification) => {
    await consumeNotification(notification)
    router.push(`/trades/${notification.listingId}`)
  }

  const openFriendCodes = async (notification) => {
    await consumeNotification(notification)
    router.push("/friend-codes")
  }

  const openPokedexImport = async (notification) => {
    await consumeNotification(notification)
    router.push(`/pokedex-import?job=${notification.jobId}`)
  }

  return (
    <div className="container notifications-page">
      <div className="card notifications-hero">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            Private alerts for Pokédex imports, trade matches and when another logged-in trainer copies your friend code. Friend-code copy alerts stay in-app only and are not sent as push notifications. Up to the 20 most recent notifications are shown.
          </p>
        </div>
        {notifications.length > 0 && (
          <div className="notifications-hero-actions">
            {unreadCount > 0 && (
              <button type="button" className="secondary-button" onClick={markAllRead}>
                Mark all read
              </button>
            )}
            <button
              type="button"
              className="notification-clear-button"
              onClick={clearNotifications}
              disabled={isClearing}
            >
              {isClearing ? "Clearing…" : "Clear notifications"}
            </button>
          </div>
        )}
      </div>

      <PushNotificationSettings />

      {notifications.length === 0 ? (
        <div className="card">
          <p className="muted">You do not have any notifications yet.</p>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => {
            const isFriendCodeGrab = notification.kind === "FRIEND_CODE_GRAB"
            const isPokedexImport = notification.kind === "POKEDEX_IMPORT"
            const isAvailable =
              !isFriendCodeGrab &&
              !isPokedexImport &&
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
                    {isPokedexImport && notification.pushError && notification.status !== "ACCEPTED" && (
                      <p className="muted">
                        Push delivery issue: {notification.pushError} The in-app result is still available here.
                      </p>
                    )}
                    <p className="muted">
                      {new Date(notification.createdAt).toLocaleString("en-GB")}
                    </p>
                  </div>

                  {isPokedexImport ? (
                    <button type="button" onClick={() => openPokedexImport(notification)}>
                      {notification.status === "COMPLETE" ? "Review import" : "View import"}
                    </button>
                  ) : isFriendCodeGrab ? (
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

  const [tradeNotifications, friendCodeNotifications, pokedexImportJobs] =
    await Promise.all([
      prisma.tradeNotification.findMany({
        where: { ownerId: userId },
        include: tradeNotificationInclude,
        orderBy: { createdAt: "desc" },
        take: NOTIFICATION_LIST_LIMIT,
      }),
      prisma.friendCodeGrabNotification.findMany({
        where: { ownerId: userId },
        include: friendCodeGrabNotificationInclude,
        orderBy: { createdAt: "desc" },
        take: NOTIFICATION_LIST_LIMIT,
      }),
      prisma.pokedexImportJob.findMany({
        where: {
          ownerId: userId,
          status: { in: POKEDEX_NOTIFICATION_STATUSES },
          notificationDismissedAt: null,
        },
        orderBy: { completedAt: "desc" },
        take: NOTIFICATION_LIST_LIMIT,
        select: {
          id: true,
          status: true,
          totalImages: true,
          error: true,
          pushError: true,
          createdAt: true,
          completedAt: true,
          notificationReadAt: true,
        },
      }),
    ])

  const notifications = [
    ...tradeNotifications.map((notification) => ({
      kind: "TRADE",
      ...serializeTradeNotification(notification),
    })),
    ...friendCodeNotifications.map(serializeFriendCodeGrabNotification),
    ...pokedexImportJobs.map(serializePokedexImportNotification),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, NOTIFICATION_LIST_LIMIT)

  return {
    props: {
      initialNotifications: notifications,
      renderedAt: Date.now(),
    },
  }
}
