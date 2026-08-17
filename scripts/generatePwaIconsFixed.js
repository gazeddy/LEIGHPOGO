const fs = require("fs")
const path = require("path")
const zlib = require("zlib")

const ROOT = path.resolve(__dirname, "..")
const PUBLIC = path.join(ROOT, "public")
const SOURCE_PARTS_DIR = path.join(ROOT, "assets", "pwa-icons")

function readSourceBase64() {
  const parts = fs
    .readdirSync(SOURCE_PARTS_DIR)
    .filter((name) => name.startsWith("release-source.b64.part"))
    .sort()

  if (!parts.length) {
    throw new Error("No LEIGHPOGO icon source parts were found")
  }

  return parts
    .map((name) => fs.readFileSync(path.join(SOURCE_PARTS_DIR, name), "utf8").trim())
    .join("")
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function decodeIndexedPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("Invalid PNG icon source")
  }

  let offset = 8
  let width
  let height
  let bitDepth
  let colorType
  let palette
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "PLTE") {
      palette = data
    } else if (type === "IDAT") {
      idat.push(data)
    } else if (type === "IEND") {
      break
    }
  }

  if (bitDepth !== 8 || colorType !== 3 || !palette) {
    throw new Error(
      `Unsupported PNG source format: bitDepth=${bitDepth}, colorType=${colorType}`,
    )
  }

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height * 3)
  let rawOffset = 0
  let previous = Buffer.alloc(width)

  function paeth(a, b, c) {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset]
    rawOffset += 1
    const scanline = raw.subarray(rawOffset, rawOffset + width)
    rawOffset += width
    const recon = Buffer.alloc(width)

    for (let x = 0; x < width; x += 1) {
      const value = scanline[x]
      const left = x > 0 ? recon[x - 1] : 0
      const up = previous[x]
      const upperLeft = x > 0 ? previous[x - 1] : 0

      if (filter === 0) recon[x] = value
      else if (filter === 1) recon[x] = (value + left) & 0xff
      else if (filter === 2) recon[x] = (value + up) & 0xff
      else if (filter === 3) recon[x] = (value + Math.floor((left + up) / 2)) & 0xff
      else if (filter === 4) recon[x] = (value + paeth(left, up, upperLeft)) & 0xff
      else throw new Error(`Unsupported PNG filter ${filter}`)
    }

    for (let x = 0; x < width; x += 1) {
      const paletteIndex = recon[x] * 3
      const pixelIndex = (y * width + x) * 3
      pixels[pixelIndex] = palette[paletteIndex]
      pixels[pixelIndex + 1] = palette[paletteIndex + 1]
      pixels[pixelIndex + 2] = palette[paletteIndex + 2]
    }

    previous = recon
  }

  return { width, height, pixels }
}

function resizeImage(source, targetWidth, targetHeight) {
  const output = Buffer.alloc(targetWidth * targetHeight * 3)

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * source.height) / targetHeight - 0.5
    const y0 = Math.max(0, Math.floor(sourceY))
    const y1 = Math.min(source.height - 1, y0 + 1)
    const fy = Math.max(0, Math.min(1, sourceY - y0))

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * source.width) / targetWidth - 0.5
      const x0 = Math.max(0, Math.floor(sourceX))
      const x1 = Math.min(source.width - 1, x0 + 1)
      const fx = Math.max(0, Math.min(1, sourceX - x0))
      const outputIndex = (y * targetWidth + x) * 3

      for (let channel = 0; channel < 3; channel += 1) {
        const p00 = source.pixels[(y0 * source.width + x0) * 3 + channel]
        const p10 = source.pixels[(y0 * source.width + x1) * 3 + channel]
        const p01 = source.pixels[(y1 * source.width + x0) * 3 + channel]
        const p11 = source.pixels[(y1 * source.width + x1) * 3 + channel]
        const top = p00 + (p10 - p00) * fx
        const bottom = p01 + (p11 - p01) * fx
        output[outputIndex + channel] = Math.round(top + (bottom - top) * fy)
      }
    }
  }

  return { width: targetWidth, height: targetHeight, pixels: output }
}

function makeMaskable(source, size = 512, innerSize = 400) {
  const output = {
    width: size,
    height: size,
    pixels: Buffer.alloc(size * size * 3, 0),
  }
  const scaled = resizeImage(source, innerSize, innerSize)
  const start = Math.floor((size - innerSize) / 2)

  for (let y = 0; y < innerSize; y += 1) {
    const sourceStart = y * innerSize * 3
    const outputStart = ((start + y) * size + start) * 3
    scaled.pixels.copy(
      output.pixels,
      outputStart,
      sourceStart,
      sourceStart + innerSize * 3,
    )
  }

  return output
}

function encodeRgbPng(image) {
  const rows = Buffer.alloc((image.width * 3 + 1) * image.height)
  let offset = 0

  for (let y = 0; y < image.height; y += 1) {
    rows[offset] = 0
    offset += 1
    const start = y * image.width * 3
    image.pixels.copy(rows, offset, start, start + image.width * 3)
    offset += image.width * 3
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(image.width, 0)
  ihdr.writeUInt32BE(image.height, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function encodeIco(png, size = 32) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = size
  entry[1] = size
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)

  return Buffer.concat([header, entry, png])
}

fs.mkdirSync(PUBLIC, { recursive: true })

const source = decodeIndexedPng(Buffer.from(readSourceBase64(), "base64"))
const icon192 = encodeRgbPng(resizeImage(source, 192, 192))
const icon512 = encodeRgbPng(resizeImage(source, 512, 512))
const appleIcon = encodeRgbPng(resizeImage(source, 180, 180))
const maskableIcon = encodeRgbPng(makeMaskable(source))
const faviconPng = encodeRgbPng(resizeImage(source, 32, 32))

fs.writeFileSync(path.join(PUBLIC, "pwa-icon-192.png"), icon192)
fs.writeFileSync(path.join(PUBLIC, "pwa-icon-512.png"), icon512)
fs.writeFileSync(path.join(PUBLIC, "pwa-icon-maskable-512.png"), maskableIcon)
fs.writeFileSync(path.join(PUBLIC, "apple-touch-icon.png"), appleIcon)
fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), encodeIco(faviconPng))

console.log("Generated LEIGHPOGO release icon set.")
