/** Sample dominant colors from an album art URL (CORS-friendly proxies may still fail → fallback). */
export function extractAlbumColors(imageUrl: string): Promise<string[]> {
  const fallback = ['#c45c26', '#e8a04a', '#8b3a1a', '#f0c070']
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      const done = (colors: string[]) => resolve(colors)
      img.onload = () => {
        try {
          const size = 32
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) return done(fallback)
          ctx.drawImage(img, 0, 0, size, size)
          const { data } = ctx.getImageData(0, 0, size, size)
          let r = 0,
            g = 0,
            b = 0,
            n = 0
          for (let i = 0; i < data.length; i += 16) {
            const rr = data[i]
            const gg = data[i + 1]
            const bb = data[i + 2]
            if (rr + gg + bb < 40 || rr + gg + bb > 720) continue
            r += rr
            g += gg
            b += bb
            n++
          }
          if (!n) return done(fallback)
          r = Math.round(r / n)
          g = Math.round(g / n)
          b = Math.round(b / n)
          const hex = (x: number) => x.toString(16).padStart(2, '0')
          const base = `#${hex(r)}${hex(g)}${hex(b)}`
          const light = `#${hex(Math.min(255, r + 40))}${hex(Math.min(255, g + 30))}${hex(Math.min(255, b + 20))}`
          const dark = `#${hex(Math.max(0, r - 30))}${hex(Math.max(0, g - 25))}${hex(Math.max(0, b - 20))}`
          const mid = `#${hex(Math.min(255, Math.round((r + 255) / 2)))}${hex(
            Math.min(255, Math.round((g + 200) / 2))
          )}${hex(Math.min(255, Math.round((b + 180) / 2)))}`
          done([base, light, dark, mid])
        } catch {
          done(fallback)
        }
      }
      img.onerror = () => done(fallback)
      img.src = imageUrl
    } catch {
      resolve(fallback)
    }
  })
}
