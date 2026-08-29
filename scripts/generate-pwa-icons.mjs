#!/usr/bin/env node
// One-off generator for placeholder PWA icons. No image libraries are installed
// in this project, so this hand-rolls a minimal PNG encoder (zlib deflate +
// CRC32) and draws a simple family-tree motif per pixel. Run once; the output
// in public/icons/ is committed as a static asset, same as favicon.ico.
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, "..", "public", "icons")
mkdirSync(outDir, { recursive: true })

const PRIMARY = [0xbb, 0x4d, 0x00] // --primary
const CREAM = [0xff, 0xfb, 0xeb] // --primary-foreground

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii")
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([length, typeBuf, data, crc])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type: RGBA
  const ihdr = chunk("IHDR", ihdrData)

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = chunk("IDAT", deflateSync(raw))
  const iend = chunk("IEND", Buffer.alloc(0))
  return Buffer.concat([signature, ihdr, idat, iend])
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function drawIcon(size, marginFrac) {
  const rgba = Buffer.alloc(size * size * 4)
  const lo = marginFrac * size
  const span = size - 2 * lo

  const map = ([x, y]) => [lo + x * span, lo + y * span]
  const [topX, topY] = map([0.5, 0.22])
  const [leftX, leftY] = map([0.22, 0.78])
  const [rightX, rightY] = map([0.78, 0.78])
  const nodeRadius = 0.145 * span
  const halfLineWidth = 0.03 * span

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      const isMotif =
        distToSegment(px, py, topX, topY, leftX, leftY) < halfLineWidth ||
        distToSegment(px, py, topX, topY, rightX, rightY) < halfLineWidth ||
        Math.hypot(px - topX, py - topY) < nodeRadius ||
        Math.hypot(px - leftX, py - leftY) < nodeRadius ||
        Math.hypot(px - rightX, py - rightY) < nodeRadius

      const color = isMotif ? CREAM : PRIMARY
      const idx = (y * size + x) * 4
      rgba[idx] = color[0]
      rgba[idx + 1] = color[1]
      rgba[idx + 2] = color[2]
      rgba[idx + 3] = 255
    }
  }
  return rgba
}

const outputs = [
  { name: "icon-192.png", size: 192, marginFrac: 0.05 },
  { name: "icon-512.png", size: 512, marginFrac: 0.05 },
  { name: "icon-maskable-512.png", size: 512, marginFrac: 0.1 },
  { name: "apple-touch-icon.png", size: 180, marginFrac: 0.05 },
]

for (const { name, size, marginFrac } of outputs) {
  const png = encodePng(size, size, drawIcon(size, marginFrac))
  writeFileSync(join(outDir, name), png)
  console.log(
    `wrote public/icons/${name} (${size}x${size}, ${png.length} bytes)`
  )
}
