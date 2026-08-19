import { execFile } from "child_process"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { promisify } from "util"
import { getServerSession } from "next-auth/next"
import { authOptions } from "../auth/[...nextauth]"

const execFileAsync = promisify(execFile)
const MAX_IMAGES = 20
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const SCANNER_PATH = path.join(process.cwd(), "scripts", "scanPokedexScreenshot.py")

let scanQueue = Promise.resolve()

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64mb",
    },
  },
}

function disableCaching(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate")
  res.setHeader("CDN-Cache-Control", "no-store")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
}

function enqueueScan(task) {
  const queued = scanQueue.then(task, task)
  scanQueue = queued.catch(() => {})
  return queued
}

function detectImageType(buffer) {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { extension: ".png", mimeType: "image/png" }
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: ".jpg", mimeType: "image/jpeg" }
  }

  return null
}

function safeDisplayName(value, fallback) {
  const name = String(value || "").trim()
  if (!name) return fallback
  return name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 140) || fallback
}

function decodeImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("Choose at least one Pokédex screenshot.")
  }
  if (images.length > MAX_IMAGES) {
    throw new Error(`Upload no more than ${MAX_IMAGES} screenshots at a time.`)
  }

  let totalBytes = 0
  return images.map((image, index) => {
    const encoded = typeof image?.data === "string" ? image.data.trim() : ""
    if (!encoded) throw new Error(`Screenshot ${index + 1} has no image data.`)

    const buffer = Buffer.from(encoded, "base64")
    if (!buffer.length) throw new Error(`Screenshot ${index + 1} could not be decoded.`)
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Screenshot ${index + 1} is larger than 8 MB.`)
    }

    const imageType = detectImageType(buffer)
    if (!imageType) {
      throw new Error(`Screenshot ${index + 1} must be a PNG or JPEG image.`)
    }

    totalBytes += buffer.length
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("The selected screenshots are too large as a batch. Keep the total below 40 MB.")
    }

    return {
      buffer,
      extension: imageType.extension,
      mimeType: imageType.mimeType,
      name: safeDisplayName(image?.name, `Screenshot ${index + 1}`),
    }
  })
}

function scannerErrorMessage(error) {
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : ""
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout)
      if (parsed?.error) return parsed.error
    } catch {
      // Fall through to the generic scanner error below.
    }
  }

  if (error?.killed || error?.signal === "SIGTERM") {
    return "OCR took too long on one of the screenshots. Try a smaller or clearer image."
  }
  return "Unable to read one of the screenshots with OCR."
}

async function runScanner(imagePath) {
  try {
    const { stdout } = await execFileAsync("python3", [SCANNER_PATH, imagePath], {
      timeout: 35_000,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    })
    const parsed = JSON.parse(stdout)
    if (parsed?.error) throw new Error(parsed.error)
    return parsed
  } catch (error) {
    const message = scannerErrorMessage(error)
    const wrapped = new Error(message)
    wrapped.cause = error
    throw wrapped
  }
}

async function scanBatch(images) {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "leighpogo-dex-"))

  try {
    const results = []
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      const imagePath = path.join(tempDirectory, `${index}${image.extension}`)
      await fs.writeFile(imagePath, image.buffer, { mode: 0o600 })
      const scanned = await runScanner(imagePath)
      results.push({
        name: image.name,
        mimeType: image.mimeType,
        width: scanned.width,
        height: scanned.height,
        entries: Array.isArray(scanned.entries) ? scanned.entries : [],
        warning: scanned.warning || null,
      })
    }
    return results
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true })
  }
}

export default async function handler(req, res) {
  disableCaching(res)

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"])
    res.status(405).end("Method Not Allowed")
    return
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.id) {
    res.status(401).json({ error: "You must be signed in to import your Pokédex." })
    return
  }

  let images
  try {
    images = decodeImages(req.body?.images)
  } catch (error) {
    res.status(400).json({ error: error.message })
    return
  }

  try {
    const results = await enqueueScan(() => scanBatch(images))
    const detectedDexNumbers = Array.from(
      new Set(results.flatMap((result) => result.entries.map((entry) => Number(entry.dexNumber))))
    )
      .filter((dexNumber) => Number.isInteger(dexNumber) && dexNumber > 0)
      .sort((left, right) => left - right)

    const likelyMissingDexNumbers = Array.from(
      new Set(
        results.flatMap((result) =>
          result.entries
            .filter((entry) => entry.classification === "missing")
            .map((entry) => Number(entry.dexNumber))
        )
      )
    ).sort((left, right) => left - right)

    res.status(200).json({
      results,
      detectedDexNumbers,
      likelyMissingDexNumbers,
    })
  } catch (error) {
    console.error("Pokédex screenshot OCR failed", error?.cause || error)
    res.status(500).json({ error: error.message || "Unable to scan the screenshots." })
  }
}
