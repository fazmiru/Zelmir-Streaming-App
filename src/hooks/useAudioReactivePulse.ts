import { useEffect, useRef } from 'react'

/**
 * Bass-energy pulse → CSS vars on <html>:
 *   --beat-scale   1 → ~1.08
 *   --beat-glow    0 → 1
 *
 * Works with the shared HTML5 <audio> (stream / offline). YouTube iframe is
 * cross-origin so we can't analyse it; caller should add class `audio-pulse-fallback`
 * on the shell while playing for a soft CSS-only pulse.
 *
 * Improvements (iOS PWA & battery):
 * - Suspend analyser when document.hidden
 * - Respect prefers-reduced-motion
 * - Auto-disable on low battery (if supported) unless user override
 * - Throttle analyser updates to ~15fps to save CPU
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
  const lastTickRef = useRef(0)
  const stoppedRef = useRef(false)

  useEffect(() => {
    const root = document.documentElement

    const reset = () => {
      root.style.setProperty('--beat-scale', '1')
      root.style.setProperty('--beat-glow', '0')
      root.classList.remove('beat-active')
    }

    if (!opts.active) {
      stoppedRef.current = true
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
    stoppedRef.current = false

    const shouldAutoDisable = async (): Promise<boolean> => {
      try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          return true
        }
      } catch {
        /* ignore */
      }

      try {
        // user preference override stored in localStorage
        const lp = localStorage.getItem('zelmir-low-power')
        if (lp === '1') return true
      } catch {
        /* ignore */
      }

      try {
        // Battery API hint (may be absent). Auto-disable when <= 0.2 and not charging.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - navigator.getBattery is available in many browsers
        if (navigator.getBattery) {
          // @ts-ignore
          const bat: any = await navigator.getBattery()
          if (bat && typeof bat.level === 'number') {
            if (bat.level <= 0.2 && !bat.charging) return true
          }
        }
      } catch {
        /* ignore */
      }
      return false
    }

    const setup = async () => {
      try {
        const disabled = await shouldAutoDisable()
        if (disabled || stoppedRef.current) {
          // leave a cheap CSS fallback
          return
        }

        const { getBackgroundAudio } = await import('../utils/iosBackgroundAudio')
        const audio = getBackgroundAudio()
        if (!audio || stoppedRef.current) return

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
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
          // smaller fft and gentle smoothing to reduce CPU
          analyser.fftSize = 128
          analyser.smoothingTimeConstant = 0.85
          analyserRef.current = analyser

          const tagged = audio as HTMLAudioElement & {
            __zelmirMediaSource?: MediaElementAudioSourceNode
          }
          if (!tagged.__zelmirMediaSource) {
            try {
              tagged.__zelmirMediaSource = ctx.createMediaElementSource(audio)
              tagged.__zelmirMediaSource.connect(analyser)
              // connect analyser to destination so graph stays alive but with low volume
              analyser.connect(ctx.destination)
            } catch (err) {
              // Element may already be connected from a previous session
              // or the browser forbids MediaElementSource (Safari can be picky).
              console.warn('audio reactive: source connect failed', err)
              return
            }
          } else {
            try {
              tagged.__zelmirMediaSource.connect(analyser)
              analyser.connect(ctx.destination)
            } catch {
              /* already connected graph or cannot reconnect */
            }
          }
        }

        const data = new Uint8Array(analyser.frequencyBinCount)

        const tick = (now = performance.now()) => {
          if (stoppedRef.current || stopped) return
          rafRef.current = requestAnimationFrame(tick)

          // Throttle to ~15fps to reduce CPU on mobile
          const minDelta = 1000 / 15
          if (now - lastTickRef.current < minDelta) return
          lastTickRef.current = now

          if (document.hidden) return

          try {
            analyser!.getByteFrequencyData(data)
          } catch (err) {
            // analyser may throw if context/state changes
            return
          }

          // Low bins ≈ bass / kick
          let sum = 0
          const n = Math.min(8, data.length)
          for (let i = 0; i < n; i++) sum += data[i]
          const avg = sum / (n * 255) // 0–1
          // Emphasize peaks
          const peak = Math.min(1, avg * 1.8)
          const smoothed = smoothRef.current * 0.6 + peak * 0.4
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

    const onLowPowerChange = () => {
      // If user toggles low power, stop the analyser now and let UI fallback run
      if (localStorage.getItem('zelmir-low-power') === '1') {
        stopped = true
        stoppedRef.current = true
        cancelAnimationFrame(rafRef.current)
        reset()
      } else {
        // user re-enabled — try setup again
        stopped = false
        stoppedRef.current = false
        void setup()
      }
    }

    window.addEventListener('zelmir:low-power-changed', onLowPowerChange)

    return () => {
      stopped = true
      stoppedRef.current = true
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('zelmir:low-power-changed', onLowPowerChange)
      reset()
    }
  }, [opts.active, opts.preferAnalyser])
}
