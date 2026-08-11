import { useEffect, useRef } from 'react'
import type { AmbientTheme } from '../types'

type Particle = {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  a: number
  tw: number
}

interface Props {
  ambient: AmbientTheme
}

/** Lightweight ambient layer — capped particle count, 1x DPR, skips frames when hidden. */
export function AmbientParticles({ ambient }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef(0)

  // lazily check low-power state from localStorage (ThemeContext sets this key)
  const isForcedLowPower = () => {
    try {
      const v = localStorage.getItem('zelmir-low-power')
      return v === '1'
    } catch {
      return false
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!ambient.enabled || ambient.style === 'off') {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    // Respect OS reduced-motion and low-power overrides
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    if (isForcedLowPower()) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const isMobile =
      window.innerWidth <= 1100 ||
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')

    // If automatic low-power is desired, use Battery API hint to avoid running on low battery
    try {
      if (!isForcedLowPower() && (navigator as any).getBattery) {
        ;(navigator as any)
          .getBattery()
          .then((bat: any) => {
            if (bat && typeof bat.level === 'number' && bat.level <= 0.18 && !bat.charging) {
              // low battery — avoid starting heavy visuals
              try {
                cancelAnimationFrame(rafRef.current)
              } catch {
                /* ignore */
              }
              return
            }
          })
          .catch(() => {})
      }
    } catch {
      /* ignore */
    }

    // Always 1x DPR — 2x canvas is a major cost on high-res displays
    const resize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w
      canvas.height = h
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      spawn()
    }

    const baseCount =
      ambient.style === 'dust' ? 28 : ambient.style === 'snow' ? 24 : ambient.style === 'embers' ? 20 : 32
    const scale = isMobile ? 0.4 : 0.65
    const count = Math.max(6, Math.min(40, Math.round(baseCount * ambient.density * scale)))

    const makeParticle = (w: number, h: number, randomY: boolean): Particle => {
      const style = ambient.style
      const sp = ambient.speed
      if (style === 'embers') {
        return {
          x: Math.random() * w,
          y: randomY ? h + Math.random() * h * 0.3 : h + 10,
          r: 1 + Math.random() * 1.8,
          vx: (Math.random() - 0.5) * 0.3 * sp,
          vy: -(0.3 + Math.random() * 0.7) * sp,
          a: 0.3 + Math.random() * 0.6,
          tw: Math.random() * Math.PI * 2,
        }
      }
      if (style === 'snow' || style === 'dust') {
        return {
          x: Math.random() * w,
          y: randomY ? Math.random() * h : -10,
          r: 0.6 + Math.random() * 1.4,
          vx: (Math.random() - 0.5) * 0.2 * sp,
          vy: (0.25 + Math.random() * 0.55) * sp,
          a: 0.25 + Math.random() * 0.55,
          tw: Math.random() * Math.PI * 2,
        }
      }
      // stars
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.2,
        vx: (Math.random() - 0.5) * 0.06 * sp,
        vy: (Math.random() - 0.5) * 0.06 * sp,
        a: 0.25 + Math.random() * 0.65,
        tw: Math.random() * Math.PI * 2,
      }
    }

    const spawn = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const list: Particle[] = []
      for (let i = 0; i < count; i++) list.push(makeParticle(w, h, true))
      particlesRef.current = list
    }

    const color = ambient.color || '#ffffff'
    const opacity = Math.max(0.05, Math.min(0.7, ambient.opacity))

    let last = 0
    const targetMs = isMobile ? 50 : 33 // ~20fps mobile, ~30fps desktop

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick)
      if (document.hidden) return
      if (now - last < targetMs) return
      last = now

      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      ctx.globalCompositeOperation = 'source-over'

      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy
        p.tw += 0.04 * ambient.speed

        if (ambient.style === 'embers') {
          if (p.y < -10 || p.x < -20 || p.x > w + 20) Object.assign(p, makeParticle(w, h, false))
        } else if (ambient.style === 'snow' || ambient.style === 'dust') {
          if (p.y > h + 10 || p.x < -20 || p.x > w + 20) {
            Object.assign(p, makeParticle(w, h, false))
            p.y = -10
          }
        } else {
          if (p.x < -10) p.x = w + 10
          if (p.x > w + 10) p.x = -10
          if (p.y < -10) p.y = h + 10
          if (p.y > h + 10) p.y = -10
        }

        const twinkle = 0.6 + 0.4 * Math.sin(p.tw)
        ctx.globalAlpha = opacity * p.a * twinkle
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
    }
  }, [ambient.enabled, ambient.style, ambient.color, ambient.density, ambient.speed, ambient.opacity])

  // If user forced low-power mode, don't render particles
  if (!ambient.enabled || ambient.style === 'off' || isForcedLowPower()) return null

  return <canvas ref={canvasRef} className="ambient-canvas" aria-hidden />
}
