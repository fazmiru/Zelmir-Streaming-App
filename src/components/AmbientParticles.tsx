*** Begin Patch
*** Update File: src/components/AmbientParticles.tsx
@@
-export function AmbientParticles({ ambient }: Props) {
-  const canvasRef = useRef<HTMLCanvasElement>(null)
-  const particlesRef = useRef<Particle[]>([])
-  const rafRef = useRef(0)
+export function AmbientParticles({ ambient }: Props) {
+  const canvasRef = useRef<HTMLCanvasElement>(null)
+  const particlesRef = useRef<Particle[]>([])
+  const rafRef = useRef(0)
+
+  // lazily check low-power state from localStorage (ThemeContext sets this key)
+  const isForcedLowPower = () => {
+    try {
+      const v = localStorage.getItem('zelmir-low-power')
+      return v === '1'
+    } catch {
+      return false
+    }
+  }
@@
-    // Respect OS reduced-motion
-    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
-      return
-    }
+    // Respect OS reduced-motion and low-power overrides
+    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
+      return
+    }
+    if (isForcedLowPower()) return
@@
-    const isMobile =
-      window.innerWidth <= 1100 ||
-      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
+    const isMobile =
+      window.innerWidth <= 1100 ||
+      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
+
+    // If automatic low-power is desired, use Battery API hint to avoid running on low battery
+    try {
+      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
+      // @ts-ignore
+      if (!isForcedLowPower() && navigator.getBattery) {
+        // @ts-ignore
+        navigator.getBattery().then((bat: any) => {
+          if (bat && typeof bat.level === 'number' && bat.level <= 0.18 && !bat.charging) {
+            // low battery — avoid starting heavy visuals
+            try {
+              cancelAnimationFrame(rafRef.current)
+            } catch {
+              /* ignore */
+            }
+            return
+          }
+        }).catch(() => {})
+      }
+    } catch {
+      /* ignore */
+    }
@@
-    const targetMs = isMobile ? 50 : 33 // ~20fps mobile, ~30fps desktop
+    const targetMs = isMobile ? 50 : 33 // ~20fps mobile, ~30fps desktop
@@
-    resize()
+    resize()
     window.addEventListener('resize', resize, { passive: true })
     rafRef.current = requestAnimationFrame(tick)
@@
-  }, [ambient.enabled, ambient.style, ambient.color, ambient.density, ambient.speed, ambient.opacity])
+  }, [ambient.enabled, ambient.style, ambient.color, ambient.density, ambient.speed, ambient.opacity])
@@
-  if (!ambient.enabled || ambient.style === 'off') return null
+  // If user forced low-power mode, don't render particles
+  if (!ambient.enabled || ambient.style === 'off' || isForcedLowPower()) return null
 
   return <canvas ref={canvasRef} className="ambient-canvas" aria-hidden />
 }
*** End Patch
