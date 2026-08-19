import prisma from "./prisma"
import { getPokedexImportQueueEstimate } from "./pokedexImportQueueEstimate"
import { sendPushToUser } from "./pushServer"

export async function notifyPokedexQueueAvailabilityIfOpen() {
  const queue = await getPokedexImportQueueEstimate()
  if (!queue.acceptingUploads) {
    return { queue, waiting: null, notified: 0 }
  }

  const alerts = await prisma.pokedexQueueAlert.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, ownerId: true },
  })

  if (alerts.length === 0) {
    return { queue, waiting: 0, notified: 0 }
  }

  let notified = 0
  for (const alert of alerts) {
    try {
      const push = await sendPushToUser(alert.ownerId, {
        title: "Pokédex uploads available",
        body: "The Pokédex import queue is ready for new screenshots. Tap to upload.",
        url: "/pokedex-import",
        tag: "pokedex-queue-available",
      })

      if (Number(push?.sent || 0) > 0) notified += 1
    } catch (error) {
      console.error("Unable to send Pokédex queue availability push", error)
    } finally {
      // This is deliberately a one-shot request. If delivery fails, the user can
      // request another alert the next time the queue is busy.
      await prisma.pokedexQueueAlert.deleteMany({ where: { id: alert.id } })
    }
  }

  return { queue, waiting: alerts.length, notified }
}
