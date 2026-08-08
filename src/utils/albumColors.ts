/**
 * Extract 4 accent colors from album art.
 * Avoids the old orange/yellow hardcoded fallback that showed on every track
 * when canvas CORS failed.
 */

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Slightly boost saturation without shifting hue toward yellow. */
function punch(r: number, g: number, b: number, amount = 1.28): [number, number, number] {
  const avg = (r + g + b) / 3
  return [
    Math.max(0, Math.min(255, avg + (r - avg) * amount)),
    Math.max(0, Math.min(255, avg + (g - avg) * amount)),
    Math.max(0, Math.min(255, avg + (b - avg) * amount)),
  ]
}

function shiftLightness(r: number, g: number, b: number, delta: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, r + delta)),
    Math.max(0, Math.min(255, g + delta)),
    Math.max(0, Math.min(255, b + delta)),
  ]
}

type Bucket = { r: number; g: number; b: number; n: number }

function sampleDominant(data: Uint8ClampedArray): string[] {
  // Quantize into 4-bit channels → up to 4096 buckets
  const map = new Map<number, Bucket>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 200) continue
    const lum = luminance(r, g, b)
    // Skip near-black / near-white (not useful accents)
    if (lum < 12 || lum > 252) continue
    // Skip very grey pixels (low chroma)
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    if (mx - mn < 8 && lum > 30 && lum < 220) continue

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const cur = map.get(key)
    if (cur) {
      cur.r += r
      cur.g += g
      cur.b += b
      cur.n++
    } else {
      map.set(key, { r, g, b, n: 1 })
    }
  }

  const buckets = [...map.values()]
    .filter((b) => b.n >= 2)
    .sort((a, b) => b.n - a.n)

  if (!buckets.length) return []

  // Greedy pick up to 4 colors that are distinct from each other
  const picked: [number, number, number][] = []
  for (const b of buckets) {
    const r = b.r / b.n
    const g = b.g / b.n
    const bl = b.b / b.n
    const tooClose = picked.some(([pr, pg, pb]) => {
      const dr = pr - r
      const dg = pg - g
      const db = pb - bl
      return dr * dr + dg * dg + db * db < 55 * 55
    })
    if (tooClose) continue
    picked.push([r, g, bl])
    if (picked.length >= 4) break
  }

  if (!picked.length) {
    const b = buckets[0]
    picked.push([b.r / b.n, b.g / b.n, b.b / b.n])
  }

  // Ensure 4 stops derived from real cover hues (not yellow fillers)
  while (picked.length < 4) {
    const src = picked[picked.length % picked.length]
    const delta = picked.length === 1 ? 36 : picked.length === 2 ? -28 : 18
    picked.push(shiftLightness(src[0], src[1], src[2], delta))
  }

  return picked.map(([r, g, b]) => {
    const [pr, pg, pb] = punch(r, g, b, 1.4)
    return rgbToHex(pr, pg, pb)
  })
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Build alternate thumbnail URLs when the primary fails CORS / 404. */
function candidateUrls(imageUrl: string): string[] {
  const urls: string[] = [imageUrl]
  const m = imageUrl.match(/\/vi\/([a-zA-Z0-9_-]{6,})\/|/i) || imageUrl.match(/([a-zA-Z0-9_-]{11})/)
  // YouTube id from common patterns
  const yt = imageUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)
  const id = yt?.[1]
  if (id) {
    urls.push(
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      `https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`
    )
  }
  // de-dupe
  return [...new Set(urls.filter(Boolean))]
}

/** Last successful extraction — better than a yellow default. */
let lastGood: string[] | null = null

const NEUTRAL_FALLBACK = ['#6b7280', '#9ca3af', '#4b5563', '#d1d5db']

export function extractAlbumColors(imageUrl: string): Promise<string[]> {
  if (!imageUrl) return Promise.resolve(lastGood || NEUTRAL_FALLBACK)

  return (async () => {
    for (const url of candidateUrls(imageUrl)) {
      try {
        const img = await loadImage(url)
        if (!img) continue
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) continue
        ctx.drawImage(img, 0, 0, size, size)
        let data: ImageData
        try {
          data = ctx.getImageData(0, 0, size, size)
        } catch {
          // CORS tainted canvas
          continue
        }
        const colors = sampleDominant(data.data)
        if (colors.length >= 2) {
          lastGood = colors
          return colors
        }
      } catch {
        /* try next url */
      }
    }
    // Prefer previous track's palette over yellow defaults
    return lastGood || NEUTRAL_FALLBACK
  })()
}
