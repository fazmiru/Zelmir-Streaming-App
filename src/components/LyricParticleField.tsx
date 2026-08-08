import { useEffect, useRef } from 'react'

interface LyricParticleFieldProps {
  text: string
  /** Bumps on each lyric line change to restart assemble */
  enterKey: number
  className?: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  size: number
  alpha: number
  trail: number
}

const MAX_PARTICLES = 520
const SAMPLE_STEP = 3

function sampleTextTargets(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number
): { x: number; y: number }[] {
  ctx.clearRect(0, 0, w, h)
  const fontSize = Math.max(18, Math.min(34, Math.floor(w * 0.055)))
  ctx.font = `700 ${fontSize}px "M PLUS Rounded 1c", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(text, w / 2, h / 2, w * 0.96)

  const { data } = ctx.getImageData(0, 0, w, h)
  const points: { x: number; y: number }[] = []
  for (let y = 0; y < h; y += SAMPLE_STEP) {
    for (let x = 0; x < w; x += SAMPLE_STEP) {
      const a = data[(y * w + x) * 4 + 3]
      if (a > 40) points.push({ x, y })
    }
  }
  ctx.clearRect(0, 0, w, h)
  return points
}

function readAccentColors(): [string, string, string] {
  const root = getComputedStyle(document.documentElement)
  const a = root.getPropertyValue('--sub-a').trim() || root.getPropertyValue('--accent-a').trim() || '#e8e0ff'
  const b = root.getPropertyValue('--sub-b').trim() || root.getPropertyValue('--accent-b').trim() || '#c4b5fd'
  const solid = root.getPropertyValue('--sub-solid').trim() || root.getPropertyValue('--accent-solid').trim() || '#ffffff'
  return [solid || '#fff', a || '#e8e0ff', b || '#c4b5fd']
}

/**
 * Procedural text assembly: scatter → attract → settle into glyph shapes.
 * Used only for Home Lyrics "Cinematic" style.
 */
export function LyricParticleField({ text, enterKey, className }: LyricParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bloomRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef(0)
  const phaseRef = useRef<'scatter' | 'assemble' | 'hold'>('assemble')
  const phaseTRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const bloom = bloomRef.current
    if (!canvas || !bloom || !text) return

    const parent = canvas.parentElement
    if (!parent) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      const rect = parent.getBoundingClientRect()
      const w = Math.max(120, Math.floor(rect.width))
      const h = Math.max(64, Math.floor(rect.height))
      for (const c of [canvas, bloom]) {
        c.width = Math.floor(w * dpr)
        c.height = Math.floor(h * dpr)
        c.style.width = `${w}px`
        c.style.height = `${h}px`
      }
      return { w, h, dpr }
    }

    let { w, h, dpr: scale } = resize()
    const ctx = canvas.getContext('2d', { alpha: true })
    const bctx = bloom.getContext('2d', { alpha: true })
    if (!ctx || !bctx) return

    // Offscreen for sampling only
    const sample = document.createElement('canvas')
    sample.width = w
    sample.height = h
    const sctx = sample.getContext('2d', { willReadFrequently: true })
    if (!sctx) return

    const targets = sampleTextTargets(sctx, text, w, h)
    if (!targets.length) return

    const colors = readAccentColors()
    const prev = particlesRef.current
    const count = Math.min(MAX_PARTICLES, Math.max(120, targets.length))
    const next: Particle[] = []

    for (let i = 0; i < count; i++) {
      const t = targets[i % targets.length]
      const old = prev[i]
      // Start from previous positions if any, else random scatter around center
      const sx = old ? old.x : w * 0.5 + (Math.random() - 0.5) * w * 0.9
      const sy = old ? old.y : h * 0.5 + (Math.random() - 0.5) * h * 0.8
      next.push({
        x: sx,
        y: sy,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 14,
        tx: t.x,
        ty: t.y,
        size: 1.1 + Math.random() * 1.8,
        alpha: 0.55 + Math.random() * 0.45,
        trail: 0.15 + Math.random() * 0.35,
      })
    }
    particlesRef.current = next
    phaseRef.current = 'scatter'
    phaseTRef.current = 0

    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      phaseTRef.current += dt

      const particles = particlesRef.current
      const phase = phaseRef.current

      // Phase: brief outward scatter, then strong attraction
      if (phase === 'scatter' && phaseTRef.current > 0.28) {
        phaseRef.current = 'assemble'
        phaseTRef.current = 0
      } else if (phase === 'assemble' && phaseTRef.current > 1.4) {
        phaseRef.current = 'hold'
      }

      const assemble = phaseRef.current !== 'scatter'
      const hold = phaseRef.current === 'hold'

      for (const p of particles) {
        if (!assemble) {
          // dispersion
          p.vx += (Math.random() - 0.5) * 40 * dt
          p.vy += (Math.random() - 0.5) * 40 * dt
          p.vx *= 0.96
          p.vy *= 0.96
        } else {
          // magnetic pull toward glyph targets
          const dx = p.tx - p.x
          const dy = p.ty - p.y
          const dist = Math.hypot(dx, dy) || 1
          const strength = hold ? 18 : 28
          p.vx += (dx / dist) * strength * dt * Math.min(dist, 80)
          p.vy += (dy / dist) * strength * dt * Math.min(dist, 80)
          // wave sweep (subtle horizontal force early in assemble)
          if (!hold) {
            p.vx += Math.sin(now * 0.004 + p.ty * 0.02) * 8 * dt
          }
          p.vx *= hold ? 0.78 : 0.86
          p.vy *= hold ? 0.78 : 0.86
          if (hold && dist < 1.2) {
            p.x = p.tx
            p.y = p.ty
            p.vx = 0
            p.vy = 0
          }
        }
        p.x += p.vx
        p.y += p.vy
      }

      // Clear + draw bloom layer (soft trails)
      const cw = canvas.width
      const ch = canvas.height
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      bctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, w, h)
      bctx.clearRect(0, 0, w, h)

      bctx.globalCompositeOperation = 'lighter'
      for (const p of particles) {
        const g = bctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4)
        g.addColorStop(0, `rgba(255,255,255,${0.22 * p.alpha})`)
        g.addColorStop(0.4, `${colors[1]}55`)
        g.addColorStop(1, 'transparent')
        bctx.fillStyle = g
        bctx.beginPath()
        bctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2)
        bctx.fill()
      }

      // Soft blur bloom via scaled copy
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.filter = 'blur(6px)'
      ctx.drawImage(bloom, 0, 0, w, h)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.restore()

      // Core bright particles
      ctx.globalCompositeOperation = 'lighter'
      for (const p of particles) {
        ctx.fillStyle = `rgba(255,255,255,${p.alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = colors[1]
        ctx.globalAlpha = 0.5 * p.alpha
        ctx.beginPath()
        ctx.arc(p.x - p.vx * p.trail, p.y - p.vy * p.trail, p.size * 0.45, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'source-over'

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    const onResize = () => {
      const dims = resize()
      w = dims.w
      h = dims.h
      scale = dims.dpr
      sample.width = w
      sample.height = h
      const sctx2 = sample.getContext('2d', { willReadFrequently: true })
      if (!sctx2) return
      const newTargets = sampleTextTargets(sctx2, text, w, h)
      const parts = particlesRef.current
      for (let i = 0; i < parts.length; i++) {
        const t = newTargets[i % Math.max(1, newTargets.length)]
        if (t) {
          parts[i].tx = t.x
          parts[i].ty = t.y
        }
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', onResize)
    }
  }, [text, enterKey])

  return (
    <div className={`lyric-particle-field ${className || ''}`} aria-hidden>
      <canvas ref={bloomRef} className="lyric-particle-bloom" />
      <canvas ref={canvasRef} className="lyric-particle-canvas" />
      <span className="lyric-particle-sr">{text}</span>
    </div>
  )
}
