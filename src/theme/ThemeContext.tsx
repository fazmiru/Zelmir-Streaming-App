*** Begin Patch
*** Update File: src/theme/ThemeContext.tsx
@@
 interface ThemeContextValue {
   theme: ThemeState
   setTheme: (next: ThemeState) => void
   backgroundTheme: ThemeState
   setBackgroundTheme: (next: ThemeState) => void
   outline: OutlineTheme
   setOutline: (next: OutlineTheme) => void
   ambient: AmbientTheme
   setAmbient: (next: AmbientTheme) => void
   backgroundStyle: BackgroundStyle
   setBackgroundStyle: (next: BackgroundStyle) => void
   subtitle: SubtitleTheme
   setSubtitle: (next: SubtitleTheme) => void
+  /** Low power override: true = force low-power, false = force normal, undefined = automatic */
+  lowPower?: boolean
+  setLowPower?: (v?: boolean) => void
 }
@@
   const [subtitle, setSubtitleState] = useState<SubtitleTheme>(() => {
@@
   })
+  // Low-power preference: undefined = automatic, true = force low-power, false = force normal
+  const [lowPower, setLowPowerState] = useState<boolean | undefined>(() => {
+    try {
+      const raw = localStorage.getItem('zelmir-low-power')
+      if (raw === '1') return true
+      if (raw === '0') return false
+    } catch {
+      /* ignore */
+    }
+    return undefined
+  })
@@
   const setSubtitle = (next: SubtitleTheme) => {
     setSubtitleState(next)
     try {
       localStorage.setItem(SUBTITLE_STORAGE_KEY, JSON.stringify(next))
     } catch {
       /* ignore */
     }
   }
+
+  const setLowPower = (v?: boolean) => {
+    try {
+      if (v === undefined) {
+        localStorage.removeItem('zelmir-low-power')
+      } else {
+        localStorage.setItem('zelmir-low-power', v ? '1' : '0')
+      }
+    } catch {
+      /* ignore */
+    }
+    setLowPowerState(v)
+    // Notify listeners (e.g. useAudioReactivePulse) to start/stop immediately
+    try {
+      window.dispatchEvent(new CustomEvent('zelmir:low-power-changed', { detail: v }))
+    } catch {
+      /* ignore */
+    }
+  }
@@
-  const value = useMemo(
-    () => ({
-      theme,
-      setTheme,
-      backgroundTheme,
-      setBackgroundTheme,
-      outline,
-      setOutline,
-      ambient,
-      setAmbient,
-      backgroundStyle,
-      setBackgroundStyle,
-      subtitle,
-      setSubtitle,
-    }),
-    // eslint-disable-next-line react-hooks/exhaustive-deps
-    [theme, backgroundTheme, outline, ambient, backgroundStyle, subtitle, user]
-  )
+  const value = useMemo(
+    () => ({
+      theme,
+      setTheme,
+      backgroundTheme,
+      setBackgroundTheme,
+      outline,
+      setOutline,
+      ambient,
+      setAmbient,
+      backgroundStyle,
+      setBackgroundStyle,
+      subtitle,
+      setSubtitle,
+      lowPower,
+      setLowPower,
+    }),
+    // eslint-disable-next-line react-hooks/exhaustive-deps
+    [theme, backgroundTheme, outline, ambient, backgroundStyle, subtitle, user, lowPower]
+  )
*** End Patch
