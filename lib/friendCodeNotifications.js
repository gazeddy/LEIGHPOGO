export const friendCodeGrabNotificationInclude = {
  copiedBy: {
    select: {
      id: true,
      ign: true,
    },
  },
  entry: {
    select: {
      id: true,
      trainerName: true,
    },
  },
}

export const serializeFriendCodeGrabNotification = (notification) => ({
  kind: "FRIEND_CODE_GRAB",
  id: notification.id,
  createdAt: notification.createdAt.toISOString(),
  readAt: notification.readAt?.toISOString() || null,
  copiedBy: {
    id: notification.copiedBy?.id,
    ign: notification.copiedBy?.ign || "Another trainer",
  },
  entry: {
    id: notification.entry?.id,
    trainerName: notification.entry?.trainerName || null,
  },
})
