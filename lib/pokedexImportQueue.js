import { execFile } from "child_process"
import { promises as fs } from "fs"
import path from "path"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

export const MAX_POKEDEX_IMPORT_IMAGES = 20
export const MAX_POKEDEX_IMPORT_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_POKEDEX_IMPORT_TOTAL_BYTES = 40 * 1024 * 1024
export const MAX_ACTIVE_POKEDEX_IMPORT_JOBS = 3

const SCANNER_PATH = path.join(process.cwd(), "scripts", "scanPokedexScreenshot.py")

const queueRoot = () =>
  process.env.POKEDEX_IMPORT_QUEUE_DIR ||
  path.join(process.cwd(), "data", "pokedex-import-queue")

const jobDirectory = (jobId) => path.join(queueRoot(), String(jobId))

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

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: ".jpg", mimeType: "image/jpeg" }
  }

  return null
}

function safeDisplayName(value, fallback) {
  const name = String(value || "").trim()
  if (!name) return fallback
  return name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 140) || fallback
}

export function decodePokedexImportImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("Choose at least one Pokédex screenshot.")
  }

  if (images.length > MAX_POKEDEX_IMPORT_IMAGES) {
    throw new Error(
      `Upload no more than ${MAX_POKEDEX_IMPORT_IMAGES} screenshots at a time.`,
    )
  }

  let totalBytes = 0

  return images.map((image, index) => {
    const encoded = typeof image?.data === "string" ? image.data.trim() : ""
    if (!encoded) throw new Error(`Screenshot ${index + 1} has no image data.`)

    const buffer = Buffer.from(encoded, "base64")
    if (!buffer.length) {
      throw new Error(`Screenshot ${index + 1} could not be decoded.`)
    }
    if (buffer.length > MAX_POKEDEX_IMPORT_IMAGE_BYTES) {
      throw new Error(`Screenshot ${index + 1} is larger than 8 MB.`)
    }

    const imageType = detectImageType(buffer)
    if (!imageType) {
      throw new Error(`Screenshot ${index + 1} must be a PNG or JPEG image.`)
    }

    totalBytes += buffer.length
    if (totalBytes > MAX_POKEDEX_IMPORT_TOTAL_BYTES) {
      throw new Error(
        "The selected screenshots are too large as a batch. Keep the total below 40 MB.",
      )
    }

    return {
      buffer,
      extension: imageType.extension,
      mimeType: imageType.mimeType,
      name: safeDisplayName(image?.name, `Screenshot ${index + 1}`),
    }
  })
}

export async function storePokedexImportImages(jobId, images) {
  const directory = jobDirectory(jobId)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })

  const manifest = []
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]
    const filename = `${String(index + 1).padStart(2, "0")}${image.extension}`
    await fs.writeFile(path.join(directory, filename), image.buffer, { mode: 0o600 })
    manifest.push({
      filename,
      name: image.name,
      mimeType: image.mimeType,
    })
  }

  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify({ images: manifest }),
    { encoding: "utf8", mode: 0o600 },
  )
}

async function loadManifest(jobId) {
  const directory = jobDirectory(jobId)
  const raw = await fs.readFile(path.join(directory, "manifest.json"), "utf8")
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed?.images) || parsed.images.length === 0) {
    throw new Error("The queued screenshots are missing their manifest.")
  }
  return { directory, images: parsed.images }
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
    const wrapped = new Error(scannerErrorMessage(error))
    wrapped.cause = error
    throw wrapped
  }
}

export async function processStoredPokedexImport(jobId, onProgress) {
  const manifest = await loadManifest(jobId)
  const results = []

  for (let index = 0; index < manifest.images.length; index += 1) {
    const image = manifest.images[index]
    const imagePath = path.join(manifest.directory, image.filename)
    const scanned = await runScanner(imagePath)

    results.push({
      name: image.name,
      mimeType: image.mimeType,
      width: scanned.width,
      height: scanned.height,
      entries: Array.isArray(scanned.entries) ? scanned.entries : [],
      warning: scanned.warning || null,
    })

    if (typeof onProgress === "function") {
      await onProgress(index + 1, manifest.images.length)
    }
  }

  const detectedDexNumbers = Array.from(
    new Set(
      results.flatMap((result) =>
        result.entries.map((entry) => Number(entry.dexNumber)),
      ),
    ),
  )
    .filter((dexNumber) => Number.isInteger(dexNumber) && dexNumber > 0)
    .sort((left, right) => left - right)

  const likelyMissingDexNumbers = Array.from(
    new Set(
      results.flatMap((result) =>
        result.entries
          .filter((entry) => entry.classification === "missing")
          .map((entry) => Number(entry.dexNumber)),
      ),
    ),
  ).sort((left, right) => left - right)

  return {
    results,
    detectedDexNumbers,
    likelyMissingDexNumbers,
  }
}

export async function removeStoredPokedexImport(jobId) {
  await fs.rm(jobDirectory(jobId), { recursive: true, force: true })
}
