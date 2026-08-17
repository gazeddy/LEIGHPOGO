const fs = require("fs")
const path = require("path")
const zlib = require("zlib")

const ROOT = path.resolve(__dirname, "..")
const PUBLIC = path.join(ROOT, "public")
const SOURCE_BASE64 = [
  "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",
].join("")

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
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Invalid PNG icon source")

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
    } else if (type === "PLTE") palette = data
    else if (type === "IDAT") idat.push(data)
    else if (type === "IEND") break
  }

  if (bitDepth !== 8 || colorType !== 3 || !palette) {
    throw new Error(`Unsupported PNG source format: bitDepth=${bitDepth}, colorType=${colorType}`)
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
  const output = { width: size, height: size, pixels: Buffer.alloc(size * size * 3, 0) }
  const scaled = resizeImage(source, innerSize, innerSize)
  const start = Math.floor((size - innerSize) / 2)
  for (let y = 0; y < innerSize; y += 1) {
    const sourceStart = y * innerSize * 3
    const outputStart = ((start + y) * size + start) * 3
    scaled.pixels.copy(output.pixels, outputStart, sourceStart, sourceStart + innerSize * 3)
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
const source = decodeIndexedPng(Buffer.from(SOURCE_BASE64, "base64"))
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
fs.rmSync(path.join(PUBLIC, "pwa-icon-192.png.base64.txt"), { force: true })

const wantedPath = path.join(ROOT, "pages", "trades", "wanted.js")
let wanted = fs.readFileSync(wantedPath, "utf8")
if (!wanted.includes('import Image from "next/image"')) {
  wanted = wanted.replace('import Link from "next/link"', 'import Image from "next/image"\nimport Link from "next/link"')
}
wanted = wanted.replace(
`        <img
          src={pokemonSpriteUrl(entry.dexNumber)}
          alt=""
          aria-hidden="true"
          className="wanted-pokemon-sprite"
          loading="lazy"
        />`,
`        <Image
          src={pokemonSpriteUrl(entry.dexNumber)}
          alt=""
          aria-hidden="true"
          width={76}
          height={76}
          className="wanted-pokemon-sprite"
        />`,
)
fs.writeFileSync(wantedPath, wanted)

console.log("Restored approved V3 release icons and converted wanted-trade sprite.")
