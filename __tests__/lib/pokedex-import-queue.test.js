import {
  calculatePokedexImportQueueEstimate,
  calculatePokedexImportSecondsPerImage,
  MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
} from "../../lib/pokedexImportQueue"

describe("Pokédex import queue estimates", () => {
  test("uses a conservative default when no processing history exists", () => {
    expect(calculatePokedexImportSecondsPerImage([])).toBe(6)

    const estimate = calculatePokedexImportQueueEstimate([], [])
    expect(estimate.estimatedWaitSeconds).toBe(5)
    expect(estimate.acceptingUploads).toBe(true)
  })

  test("learns average OCR time per image from completed jobs", () => {
    const history = [
      {
        totalImages: 4,
        startedAt: new Date("2026-08-19T10:00:00Z"),
        completedAt: new Date("2026-08-19T10:00:20Z"),
      },
      {
        totalImages: 2,
        startedAt: new Date("2026-08-19T10:01:00Z"),
        completedAt: new Date("2026-08-19T10:01:10Z"),
      },
    ]

    expect(calculatePokedexImportSecondsPerImage(history)).toBe(5)
  })

  test("includes remaining processing work and the worker handoff delay", () => {
    const estimate = calculatePokedexImportQueueEstimate([
      {
        status: "PROCESSING",
        totalImages: 10,
        processedImages: 2,
      },
    ])

    expect(estimate.estimatedWaitSeconds).toBe(58)
    expect(estimate.acceptingUploads).toBe(true)
  })

  test("pauses admissions when first-come-first-served work ahead exceeds two minutes", () => {
    const estimate = calculatePokedexImportQueueEstimate([
      { status: "QUEUED", totalImages: 10, processedImages: 0 },
      { status: "QUEUED", totalImages: 10, processedImages: 0 },
    ])

    expect(estimate.estimatedWaitSeconds).toBe(145)
    expect(estimate.estimatedWaitSeconds).toBeGreaterThan(
      MAX_POKEDEX_IMPORT_QUEUE_WAIT_SECONDS,
    )
    expect(estimate.acceptingUploads).toBe(false)
  })
})
