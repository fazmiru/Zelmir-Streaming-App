import { useTheme } from '../theme/ThemeContext'
import {
  DEFAULT_THEME,
  DEFAULT_BACKGROUND_THEME,
  DEFAULT_OUTLINE,
  DEFAULT_AMBIENT,
  DEFAULT_BACKGROUND_STYLE,
  DEFAULT_SUBTITLE,
  type ThemeState,
  type OutlineTheme,
  type AmbientStyle,
  type BackgroundStyle,
  type SubtitleMode,
  type SubtitleGlitch,
  type SubtitleFxStyle,
} from '../types'

const PRESETS = [
  { label: 'Paper white', solid: '#f5f5f2' },
  { label: 'Ice blue', solid: '#8ecdf7' },
  { label: 'Soft rose', solid: '#f2a6c1' },
  { label: 'Amber', solid: '#f2c069' },
]

const CYCLE_PRESETS: { label: string; colors: string[] }[] = [
  { label: 'White ↔ Sky', colors: ['#f5f5f2', '#7dd3fc'] },
  { label: 'Rose ↔ Amber', colors: ['#f2a6c1', '#f2c069'] },
  { label: 'Mint ↔ Violet', colors: ['#8ef2c8', '#c39dfa'] },
  { label: 'Fire quartet', colors: ['#ef4444', '#f97316', '#eab308', '#ec4899'] },
]

const BG_PRESETS: { label: string; colors: string[] }[] = [
  { label: 'Violet ↔ Pink', colors: ['#7c3aed', '#ec4899'] },
  { label: 'Ocean ↔ Teal', colors: ['#2563eb', '#0d9488'] },
  { label: 'Ember ↔ Amber', colors: ['#b91c1c', '#f59e0b'] },
  { label: 'Forest ↔ Lime', colors: ['#166534', '#a3e635'] },
  { label: 'Neon four', colors: ['#7c3aed', '#ec4899', '#06b6d4', '#a3e635'] },
]

interface ColorSectionProps {
  title: string
  description: string
  theme: ThemeState
  onChange: (next: ThemeState) => void
  onReset: () => void
  presets: { label: string; solid: string }[]
  cyclePresets: { label: string; colors: string[] }[]
  speedLabel: (seconds: number) => string
  speedMin: number
  speedMax: number
}

function ColorSection({
  title,
  description,
  theme,
  onChange,
  onReset,
  presets,
  cyclePresets,
  speedLabel,
  speedMin,
  speedMax,
}: ColorSectionProps) {
  const colors = theme.colors?.length >= 2 ? theme.colors : [theme.solid, theme.solid]

  const setColorAt = (index: number, value: string) => {
    const next = [...colors]
    next[index] = value
    onChange({ ...theme, colors: next })
  }

  const addColor = () => {
    if (colors.length >= 4) return
    const last = colors[colors.length - 1] ?? theme.solid
    onChange({ ...theme, colors: [...colors, last] })
  }

  const removeColor = (index: number) => {
    if (colors.length <= 2) return
    onChange({ ...theme, colors: colors.filter((_, i) => i !== index) })
  }

  return (
    <div className="settings-panel">
      <h2>{title}</h2>
      <p className="settings-subtitle">{description}</p>

      <div className="settings-mode-toggle">
        <button
          className={`mode-button ${theme.mode === 'solid' ? 'mode-button-active accent-fill' : ''}`}
          onClick={() => onChange({ ...theme, mode: 'solid' })}
        >
          Solid
        </button>
        <button
          className={`mode-button ${theme.mode === 'cycle' ? 'mode-button-active accent-fill' : ''}`}
          onClick={() => onChange({ ...theme, mode: 'cycle' })}
        >
          Cycling
        </button>
        <button
          className={`mode-button ${theme.mode === 'pulse' ? 'mode-button-active accent-fill' : ''}`}
          onClick={() => onChange({ ...theme, mode: 'pulse' })}
        >
          Pulse
        </button>
        <button
          className={`mode-button ${theme.mode === 'album' ? 'mode-button-active accent-fill' : ''}`}
          onClick={() => onChange({ ...theme, mode: 'album' })}
        >
          Song album
        </button>
      </div>

      {theme.mode === 'album' && (
        <p className="settings-subtitle" style={{ marginTop: 4, marginBottom: 8 }}>
          Follows the currently playing track&apos;s cover colors (play button, seek bar, active tabs).
        </p>
      )}

      {theme.mode === 'solid' && (
        <div className="settings-section">
          <label className="settings-label" htmlFor={`${title}-solid-color`}>
            Custom color
          </label>
          <div className="color-row">
            <input
              id={`${title}-solid-color`}
              type="color"
              value={theme.solid}
              onChange={(e) => onChange({ ...theme, solid: e.target.value })}
            />
            <span>{theme.solid}</span>
          </div>

          <p className="settings-label">Presets</p>
          <div className="preset-row">
            {presets.map((p) => (
              <button
                key={p.label}
                className="preset-swatch"
                style={{ background: p.solid }}
                title={p.label}
                onClick={() => onChange({ ...theme, solid: p.solid })}
              />
            ))}
          </div>
        </div>
      )}

      {(theme.mode === 'cycle' || theme.mode === 'pulse') && (
        <div className="settings-section">
          {colors.map((c, i) => (
            <div key={i} className="color-row-with-action">
              <label className="settings-label" htmlFor={`${title}-color-${i}`}>
                Color {String.fromCharCode(65 + i)}
              </label>
              <div className="color-row">
                <input
                  id={`${title}-color-${i}`}
                  type="color"
                  value={c}
                  onChange={(e) => setColorAt(i, e.target.value)}
                />
                <span>{c}</span>
                {colors.length > 2 && (
                  <button
                    type="button"
                    className="color-remove-btn"
                    title="Remove color"
                    onClick={() => removeColor(i)}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}

          {colors.length < 4 && (
            <button type="button" className="add-color-btn" onClick={addColor}>
              + Add color ({colors.length}/4)
            </button>
          )}

          <label className="settings-label" htmlFor={`${title}-speed`}>
            {theme.mode === 'pulse' ? 'Pulse speed' : 'Cycle speed'} — {speedLabel(theme.speed)}
          </label>
          <input
            id={`${title}-speed`}
            type="range"
            min={speedMin}
            max={speedMax}
            value={theme.speed}
            onChange={(e) => onChange({ ...theme, speed: Number(e.target.value) })}
            className="accent-range"
          />

          <p className="settings-label">Presets</p>
          <div className="preset-row">
            {cyclePresets.map((p) => (
              <button
                key={p.label}
                className="preset-swatch preset-swatch-split"
                style={{
                  background: `linear-gradient(90deg, ${p.colors.join(', ')})`,
                }}
                title={p.label}
                onClick={() => onChange({ ...theme, colors: [...p.colors] })}
              />
            ))}
          </div>
        </div>
      )}

      <button className="reset-button" onClick={onReset}>
        Reset to default
      </button>
    </div>
  )
}

function OutlineSection({
  outline,
  onChange,
  onReset,
}: {
  outline: OutlineTheme
  onChange: (next: OutlineTheme) => void
  onReset: () => void
}) {
  return (
    <div className="settings-panel">
      <h2>Button outline</h2>
      <p className="settings-subtitle">
        Border around accent buttons (Search, Play, mode pills, etc.). Independent from the fill
        color. Set thickness to 0 to hide.
      </p>

      <div className="settings-section">
        <label className="settings-label" htmlFor="outline-color">
          Outline color
        </label>
        <div className="color-row">
          <input
            id="outline-color"
            type="color"
            value={outline.color}
            onChange={(e) => onChange({ ...outline, color: e.target.value })}
          />
          <span>{outline.color}</span>
        </div>

        <label className="settings-label" htmlFor="outline-thickness">
          Thickness — {outline.thickness}px
        </label>
        <input
          id="outline-thickness"
          type="range"
          min={0}
          max={6}
          step={1}
          value={outline.thickness}
          onChange={(e) => onChange({ ...outline, thickness: Number(e.target.value) })}
          className="accent-range"
        />

        <div className="outline-preview-row">
          <span className="settings-label">Preview</span>
          <button type="button" className="accent-fill outline-preview-btn" tabIndex={-1}>
            Button
          </button>
          <button
            type="button"
            className="transport-button transport-button-main accent-fill outline-preview-play"
            tabIndex={-1}
            aria-label="Play preview"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.4-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8Z" />
            </svg>
          </button>
        </div>
      </div>

      <button className="reset-button" onClick={onReset}>
        Reset to default
      </button>
    </div>
  )
}

export function ThemeSettings() {
  const {
    theme,
    setTheme,
    backgroundTheme,
    setBackgroundTheme,
    outline,
    setOutline,
    ambient,
    setAmbient,
    backgroundStyle,
    setBackgroundStyle,
    subtitle,
    setSubtitle,
  } = useTheme()

  return (
    <div className="settings-page">
      <ColorSection
        title="Background"
        description="The animated backdrop behind Home. Its own color system, separate from the rest of the app."
        theme={backgroundTheme}
        onChange={setBackgroundTheme}
        onReset={() => setBackgroundTheme(DEFAULT_BACKGROUND_THEME)}
        presets={BG_PRESETS.map((p) => ({ label: p.label, solid: p.colors[0] }))}
        cyclePresets={BG_PRESETS}
        speedLabel={(s) => `${s}s per loop`}
        speedMin={3}
        speedMax={30}
      />

      <div className="settings-panel">
        <h2>Background effect</h2>
        <p className="settings-subtitle">
          Visual treatment for the backdrop — soft glow orbs, or a halftone mesh glow.
        </p>
        <div className="preset-row bg-style-row">
          {(
            [
              { id: 'glow', label: 'Glow orbs' },
              { id: 'halftone', label: 'Halftone mesh' },
            ] as { id: BackgroundStyle; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`preset-chip ${backgroundStyle === opt.id ? 'preset-chip-active' : ''}`}
              onClick={() => setBackgroundStyle(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="settings-reset"
          onClick={() => setBackgroundStyle(DEFAULT_BACKGROUND_STYLE)}
        >
          Reset effect
        </button>
      </div>

      <ColorSection
        title="Accent"
        description="Button fill, the seek bar, your active tab, the wordmark, and the play button."
        theme={theme}
        onChange={setTheme}
        onReset={() => setTheme(DEFAULT_THEME)}
        presets={PRESETS}
        cyclePresets={CYCLE_PRESETS}
        speedLabel={(s) => (theme.mode === 'pulse' ? `${s}s per beat` : `${s}s per loop`)}
        speedMin={2}
        speedMax={20}
      />

      <OutlineSection
        outline={outline}
        onChange={setOutline}
        onReset={() => setOutline(DEFAULT_OUTLINE)}
      />

      <div className="settings-panel">
        <h2>Home lyrics</h2>
        <p className="settings-subtitle">
          Active lyric on the home screen (desktop &amp; iPad only) — optional cyber glitch accent.
        </p>

        <div className="settings-mode-toggle">
          <button
            type="button"
            className={`mode-button ${subtitle.enabled ? 'mode-button-active accent-fill' : ''}`}
            onClick={() => setSubtitle({ ...subtitle, enabled: true })}
          >
            On
          </button>
          <button
            type="button"
            className={`mode-button ${!subtitle.enabled ? 'mode-button-active accent-fill' : ''}`}
            onClick={() => setSubtitle({ ...subtitle, enabled: false })}
          >
            Off
          </button>
        </div>

        <p className="settings-label">Color style</p>
        <div className="settings-mode-toggle">
          {(
            [
              { id: 'solid', label: 'Solid' },
              { id: 'gradient', label: 'Gradient' },
              { id: 'cycle', label: 'Cycling' },
              { id: 'album', label: 'Song album' },
            ] as { id: SubtitleMode; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-button ${subtitle.mode === opt.id ? 'mode-button-active accent-fill' : ''}`}
              onClick={() => setSubtitle({ ...subtitle, mode: opt.id, enabled: true })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {subtitle.mode === 'album' && (
          <p className="settings-subtitle">Uses the currently playing track&apos;s cover colors.</p>
        )}

        {subtitle.mode === 'solid' && (
          <div className="settings-section">
            <label className="settings-label">Custom color</label>
            <div className="color-row">
              <input
                type="color"
                value={subtitle.solid}
                onChange={(e) => setSubtitle({ ...subtitle, solid: e.target.value })}
              />
              <span>{subtitle.solid}</span>
            </div>
          </div>
        )}

        {(subtitle.mode === 'gradient' || subtitle.mode === 'cycle') && (
          <div className="settings-section">
            {subtitle.colors.slice(0, 4).map((c, i) => (
              <div key={i} className="color-row-with-action">
                <label className="settings-label">Color {String.fromCharCode(65 + i)}</label>
                <div className="color-row">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => {
                      const colors = [...subtitle.colors]
                      while (colors.length < 4) colors.push(colors[colors.length - 1] || c)
                      colors[i] = e.target.value
                      setSubtitle({ ...subtitle, colors: colors.slice(0, 4) })
                    }}
                  />
                  <span>{c}</span>
                </div>
              </div>
            ))}
            {subtitle.mode === 'cycle' && (
              <>
                <label className="settings-label" htmlFor="sub-speed">
                  Cycle speed — {subtitle.speed}s per loop
                </label>
                <input
                  id="sub-speed"
                  type="range"
                  min={3}
                  max={20}
                  step={1}
                  value={subtitle.speed}
                  onChange={(e) => setSubtitle({ ...subtitle, speed: Number(e.target.value) })}
                />
              </>
            )}
          </div>
        )}

        <p className="settings-label">Lyric look</p>
        <div className="settings-mode-toggle">
          {(
            [
              { id: 'classic', label: 'Classic glitch' },
              { id: 'cinematic', label: 'Cinematic MV' },
            ] as { id: SubtitleFxStyle; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-button ${subtitle.fxStyle === opt.id ? 'mode-button-active accent-fill' : ''}`}
              onClick={() => setSubtitle({ ...subtitle, fxStyle: opt.id, enabled: true })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="settings-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
          Cinematic MV — large glowing type, ghost layers &amp; particle dust (like a Japanese music video).
        </p>

        <p className="settings-label">Glitch</p>
        <div className="settings-mode-toggle">
          {(
            [
              { id: 'off', label: 'Off' },
              { id: 'on_change', label: 'On line change' },
              { id: 'subtle', label: 'Occasional' },
            ] as { id: SubtitleGlitch; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-button ${subtitle.glitch === opt.id ? 'mode-button-active accent-fill' : ''}`}
              onClick={() => setSubtitle({ ...subtitle, glitch: opt.id })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="settings-reset"
          onClick={() => setSubtitle(DEFAULT_SUBTITLE)}
        >
          Reset home lyrics
        </button>
      </div>

      <div className="settings-panel">
        <h2>Ambient effects</h2>
        <p className="settings-subtitle">
          Soft cinematic particles over the app — stars, embers, dust, or snow. Fully optional.
        </p>

        <div className="settings-mode-toggle">
          <button
            type="button"
            className={`mode-button ${ambient.enabled ? 'mode-button-active accent-fill' : ''}`}
            onClick={() => setAmbient({ ...ambient, enabled: true })}
          >
            On
          </button>
          <button
            type="button"
            className={`mode-button ${!ambient.enabled ? 'mode-button-active accent-fill' : ''}`}
            onClick={() => setAmbient({ ...ambient, enabled: false })}
          >
            Off
          </button>
        </div>

        <p className="settings-label">Style</p>
        <div className="preset-row">
          {(['stars', 'embers', 'dust', 'snow'] as AmbientStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              className={`preset-chip ${ambient.style === style ? 'preset-chip-active' : ''}`}
              onClick={() => setAmbient({ ...ambient, style, enabled: true })}
            >
              {style.charAt(0).toUpperCase() + style.slice(1)}
            </button>
          ))}
        </div>

        <label className="settings-label" htmlFor="ambient-color">
          Color
        </label>
        <div className="color-row">
          <input
            id="ambient-color"
            type="color"
            value={ambient.color}
            onChange={(e) => setAmbient({ ...ambient, color: e.target.value })}
          />
          <span>{ambient.color}</span>
        </div>

        <label className="settings-label" htmlFor="ambient-density">
          Density — {ambient.density.toFixed(1)}×
        </label>
        <input
          id="ambient-density"
          type="range"
          min={0.3}
          max={2}
          step={0.1}
          value={ambient.density}
          onChange={(e) => setAmbient({ ...ambient, density: Number(e.target.value) })}
          className="accent-range"
        />

        <label className="settings-label" htmlFor="ambient-speed">
          Speed — {ambient.speed.toFixed(1)}×
        </label>
        <input
          id="ambient-speed"
          type="range"
          min={0.3}
          max={2}
          step={0.1}
          value={ambient.speed}
          onChange={(e) => setAmbient({ ...ambient, speed: Number(e.target.value) })}
          className="accent-range"
        />

        <label className="settings-label" htmlFor="ambient-opacity">
          Opacity — {Math.round(ambient.opacity * 100)}%
        </label>
        <input
          id="ambient-opacity"
          type="range"
          min={0.05}
          max={0.8}
          step={0.05}
          value={ambient.opacity}
          onChange={(e) => setAmbient({ ...ambient, opacity: Number(e.target.value) })}
          className="accent-range"
        />

        <button className="reset-button" type="button" onClick={() => setAmbient(DEFAULT_AMBIENT)}>
          Reset ambient
        </button>
      </div>

    </div>
  )
}
