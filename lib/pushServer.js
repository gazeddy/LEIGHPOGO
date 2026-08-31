import prisma from "./prisma"
import { pushPreferenceEnabled } from "./pushPreferences"
import { isWebPushConfigured, sendWebPush } from "./webPush"

export const sendPushToUser = async (ownerId, payload, options = {}) => {
  const numericOwnerId = Number(ownerId)

  if (!Number.isInteger(numericOwnerId)) {
    return {
      configured: isWebPushConfigured(),
      subscriptions: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      suppressed: false,
    }
  }

  if (!isWebPushConfigured()) {
    return {
      configured: false,
      subscriptions: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      suppressed: false,
    }
  }

  if (
    options.preferenceKey &&
    !(await pushPreferenceEnabled(numericOwnerId, options.preferenceKey))
  ) {
    return {
      configured: true,
      subscriptions: 0,
      sent: 0,
      failed: 0,
      removed: 0,
      suppressed: true,
    }
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { ownerId: numericOwnerId },
    select: {
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  })

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const result = await sendWebPush(subscription, payload)

        if (result.expired) {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: subscription.endpoint },
          })
        }

        return result
      } catch (error) {
        console.error(
          "Unable to send Web Push notification:",
          error?.message || error,
        )
        return { ok: false, status: null, expired: false }
      }
    }),
  )

  return {
    configured: true,
    subscriptions: subscriptions.length,
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    removed: results.filter((result) => result.expired).length,
    suppressed: false,
  }
}
