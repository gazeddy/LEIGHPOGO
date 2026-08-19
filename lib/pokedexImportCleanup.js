import prisma from "./prisma"
import { removeStoredPokedexImport } from "./pokedexImportQueue"

const CHUNK_SIZE = 250

const normaliseDexNumbers = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(Number)
        .filter((dexNumber) => Number.isInteger(dexNumber) && dexNumber > 0),
    ),
  ).sort((left, right) => left - right)

const chunksOf = (values, size = CHUNK_SIZE) => {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function rollbackFromResultJson(resultJson) {
  if (!resultJson) return null

  const parsed = JSON.parse(resultJson)
  const rollback = parsed?.rollback
  if (!rollback || Number(rollback.version) !== 1) return null

  return {
    addedDexNumbers: normaliseDexNumbers(rollback.addedDexNumbers),
    removedDexNumbers: normaliseDexNumbers(rollback.removedDexNumbers),
    removedWantedTrades: Array.isArray(rollback.removedWantedTrades)
      ? rollback.removedWantedTrades
      : [],
  }
}

const wantedTradeMatchWhere = (ownerId, trade) => ({
  ownerId,
  dexNumber: Number(trade.dexNumber),
  pokemonName: String(trade.pokemonName || ""),
  shiny: Boolean(trade.shiny),
  lucky: Boolean(trade.lucky),
  xxl: Boolean(trade.xxl),
  xxs: Boolean(trade.xxs),
  costume: Boolean(trade.costume),
  background: Boolean(trade.background),
  dynamax: Boolean(trade.dynamax),
  gigantamax: Boolean(trade.gigantamax),
  notes: trade.notes == null ? null : String(trade.notes),
})

async function restoreRollback(tx, ownerId, rollback) {
  if (!rollback) return

  for (const chunk of chunksOf(rollback.addedDexNumbers)) {
    await tx.pokedexEntry.deleteMany({
      where: {
        ownerId,
        dexNumber: { in: chunk },
      },
    })
  }

  for (const chunk of chunksOf(rollback.removedDexNumbers)) {
    const existing = await tx.pokedexEntry.findMany({
      where: {
        ownerId,
        dexNumber: { in: chunk },
      },
      select: { dexNumber: true },
    })
    const existingSet = new Set(existing.map((entry) => Number(entry.dexNumber)))
    const missing = chunk.filter((dexNumber) => !existingSet.has(dexNumber))

    if (missing.length > 0) {
      await tx.pokedexEntry.createMany({
        data: missing.map((dexNumber) => ({ ownerId, dexNumber })),
      })
    }
  }

  for (const trade of rollback.removedWantedTrades) {
    const where = wantedTradeMatchWhere(ownerId, trade)
    const existing = await tx.wantedTrade.findFirst({
      where,
      select: { id: true },
    })

    if (existing) continue

    const data = { ...where }
    if (trade.createdAt) data.createdAt = new Date(trade.createdAt)
    if (trade.updatedAt) data.updatedAt = new Date(trade.updatedAt)

    await tx.wantedTrade.create({ data })
  }
}

export async function deletePokedexImportCompletely(job, ownerId) {
  if (!job || Number(job.ownerId) !== Number(ownerId)) {
    throw new Error("Pokédex import cleanup ownership check failed.")
  }

  // Remove private files first. If filesystem cleanup fails, keep the DB row so
  // Clear Notifications can safely be retried instead of orphaning screenshots.
  await removeStoredPokedexImport(job.id)

  const rollback = rollbackFromResultJson(job.resultJson)

  await prisma.$transaction(async (tx) => {
    await restoreRollback(tx, ownerId, rollback)

    const deleted = await tx.pokedexImportJob.deleteMany({
      where: {
        id: job.id,
        ownerId,
      },
    })

    if (deleted.count !== 1) {
      throw new Error(`Pokédex import ${job.id} could not be deleted.`)
    }
  })

  return {
    deleted: true,
    rolledBack: Boolean(rollback),
  }
}
