import { useEffect, useRef } from 'react'

/**
 * Bass-energy pulse → CSS vars on <html>:
 *   --beat-scale   1 → ~1.08
 *   --beat-glow    0 → 1
 *
 * Works with the shared HTML5 <audio> (stream / offline). YouTube iframe is
 * cross-origin so we can't analyse it; caller should add class `audio-pulse-fallback`
 * on the shell while playing for a soft CSS-only pulse.
 */
export function useAudioReactivePulse(opts: {
  active: boolean
  /** When true, try to analyse the shared background <audio> element */
  preferAnalyser: boolean
}) {
  const rafRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const smoothRef = useRef(0)

  useEffect(() => {
    const root = document.documentElement

    const reset = () => {
      root.style.setProperty('--beat-scale', '1')
      root.style.setProperty('--beat-glow', '0')
      root.classList.remove('beat-active')
    }

    if (!opts.active) {
      cancelAnimationFrame(rafRef.current)
      reset()
      return
    }

    root.classList.add('beat-active')

    // Soft fallback always available; analyser upgrades when possible
    if (!opts.preferAnalyser) {
      return () => {
        reset()
      }
    }

    let stopped = false

    const setup = async () => {
      try {
        const { getBackgroundAudio } = await import('../utils/iosBackgroundAudio')
        const audio = getBackgroundAudio()
        if (!audio || stopped) return

        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext
        if (!AudioCtx) return

        // Reuse context + source (createMediaElementSource can only run once per element)
        let ctx = ctxRef.current
        if (!ctx || ctx.state === 'closed') {
          ctx = new AudioCtx()
          ctxRef.current = ctx
        }
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {})
        }

        let analyser = analyserRef.current
        if (!analyser) {
          analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.75
          analyserRef.current = analyser

          const tagged = audio as HTMLAudioElement & {
            __zelmirMediaSource?: MediaElementAudioSourceNode
          }
          if (!tagged.__zelmirMediaSource) {
            try {
              tagged.__zelmirMediaSource = ctx.createMediaElementSource(audio)
              tagged.__zelmirMediaSource.connect(analyser)
              analyser.connect(ctx.destination)
            } catch (err) {
              // Element may already be connected from a previous session
              console.warn('audio reactive: source connect failed', err)
              return
            }
          } else {
            try {
              tagged.__zelmirMediaSource.connect(analyser)
              analyser.connect(ctx.destination)
            } catch {
              /* already connected graph */
            }
          }
        }

        const data = new Uint8Array(analyser.frequencyBinCount)

        const tick = () => {
          if (stopped) return
          rafRef.current = requestAnimationFrame(tick)
          if (document.hidden) return

          analyser!.getByteFrequencyData(data)
          // Low bins ≈ bass / kick
          let sum = 0
          const n = Math.min(12, data.length)
          for (let i = 0; i < n; i++) sum += data[i]
          const avg = sum / (n * 255) // 0–1
          // Emphasize peaks
          const peak = Math.min(1, avg * 1.6)
          const smoothed = smoothRef.current * 0.55 + peak * 0.45
          smoothRef.current = smoothed

          const scale = 1 + smoothed * 0.07
          root.style.setProperty('--beat-scale', scale.toFixed(4))
          root.style.setProperty('--beat-glow', smoothed.toFixed(4))
        }

        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        console.warn('audio reactive setup failed', err)
      }
    }

    void setup()

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      reset()
    }
  }, [opts.active, opts.preferAnalyser])
}
