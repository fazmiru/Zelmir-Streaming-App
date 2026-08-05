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

export function AmbientParticles({ ambient }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!ambient.enabled || ambient.style === 'off') {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      spawn()
    }

    const baseCount = ambient.style === 'dust' ? 55 : ambient.style === 'snow' ? 50 : 70
    const count = Math.max(12, Math.round(baseCount * ambient.density))

    const spawn = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const list: Particle[] = []
      for (let i = 0; i < count; i++) {
        list.push(makeParticle(w, h, true))
      }
      particlesRef.current = list
    }

    const makeParticle = (w: number, h: number, randomY: boolean): Particle => {
      const style = ambient.style
      const sp = ambient.speed
      if (style === 'embers') {
        return {
          x: Math.random() * w,
          y: randomY ? h + Math.random() * h * 0.3 : h + 10,
          r: 1 + Math.random() * 2.2,
          vx: (Math.random() - 0.5) * 0.35 * sp,
          vy: -(0.35 + Math.random() * 0.9) * sp,
          a: 0.3 + Math.random() * 0.7,
          tw: Math.random() * Math.PI * 2,
        }
      }
      if (style === 'snow' || style === 'dust') {
        return {
          x: Math.random() * w,
          y: randomY ? Math.random() * h : -10,
          r: style === 'dust' ? 0.6 + Math.random() * 1.4 : 1.2 + Math.random() * 2.5,
          vx: (Math.random() - 0.5) * 0.4 * sp,
          vy: (0.25 + Math.random() * 0.7) * sp,
          a: 0.25 + Math.random() * 0.6,
          tw: Math.random() * Math.PI * 2,
        }
      }
      // stars — slow drift + twinkle
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.08 * sp,
        vy: (Math.random() - 0.5) * 0.08 * sp,
        a: 0.2 + Math.random() * 0.8,
        tw: Math.random() * Math.PI * 2,
      }
    }

    const color = ambient.color || '#ffffff'
    const opacity = Math.max(0.05, Math.min(0.9, ambient.opacity))

    const tick = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = ambient.style === 'embers' ? 'lighter' : 'source-over'

      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy
        p.tw += 0.03 * ambient.speed

        if (ambient.style === 'embers') {
          if (p.y < -10 || p.x < -20 || p.x > w + 20) {
            Object.assign(p, makeParticle(w, h, false))
          }
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

        const twinkle =
          ambient.style === 'stars' ? 0.55 + 0.45 * Math.sin(p.tw) : 0.75 + 0.25 * Math.sin(p.tw)
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.globalAlpha = opacity * p.a * twinkle
        if (ambient.style === 'embers') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3)
          g.addColorStop(0, color)
          g.addColorStop(1, 'transparent')
          ctx.fillStyle = g
          ctx.globalAlpha = opacity * p.a * twinkle
          ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2)
        } else {
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafRef.current)
    }
  }, [ambient.enabled, ambient.style, ambient.color, ambient.density, ambient.speed, ambient.opacity])

  if (!ambient.enabled || ambient.style === 'off') return null

  return (
    <canvas
      ref={canvasRef}
      className="ambient-canvas"
      aria-hidden
    />
  )
}
