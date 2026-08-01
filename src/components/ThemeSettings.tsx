import { useTheme } from '../theme/ThemeContext'
import { DEFAULT_THEME, DEFAULT_BACKGROUND_THEME, type ThemeState } from '../types'

const PRESETS = [
  { label: 'Paper white', solid: '#f5f5f2' },
  { label: 'Ice blue', solid: '#8ecdf7' },
  { label: 'Soft rose', solid: '#f2a6c1' },
  { label: 'Amber', solid: '#f2c069' },
]

const CYCLE_PRESETS: { label: string; a: string; b: string }[] = [
  { label: 'White ↔ Sky', a: '#f5f5f2', b: '#7dd3fc' },
  { label: 'Rose ↔ Amber', a: '#f2a6c1', b: '#f2c069' },
  { label: 'Mint ↔ Violet', a: '#8ef2c8', b: '#c39dfa' },
]

const BG_PRESETS: { label: string; a: string; b: string }[] = [
  { label: 'Violet ↔ Pink', a: '#7c3aed', b: '#ec4899' },
  { label: 'Ocean ↔ Teal', a: '#2563eb', b: '#0d9488' },
  { label: 'Ember ↔ Amber', a: '#b91c1c', b: '#f59e0b' },
  { label: 'Forest ↔ Lime', a: '#166534', b: '#a3e635' },
]

interface ColorSectionProps {
  title: string
  description: string
  theme: ThemeState
  onChange: (next: ThemeState) => void
  onReset: () => void
  presets: { label: string; solid: string }[]
  cyclePresets: { label: string; a: string; b: string }[]
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
      </div>

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
          <label className="settings-label" htmlFor={`${title}-color-a`}>
            Color A
          </label>
          <div className="color-row">
            <input
              id={`${title}-color-a`}
              type="color"
              value={theme.cycleA}
              onChange={(e) => onChange({ ...theme, cycleA: e.target.value })}
            />
            <span>{theme.cycleA}</span>
          </div>

          <label className="settings-label" htmlFor={`${title}-color-b`}>
            Color B
          </label>
          <div className="color-row">
            <input
              id={`${title}-color-b`}
              type="color"
              value={theme.cycleB}
              onChange={(e) => onChange({ ...theme, cycleB: e.target.value })}
            />
            <span>{theme.cycleB}</span>
          </div>

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
                style={{ background: `linear-gradient(90deg, ${p.a}, ${p.b})` }}
                title={p.label}
                onClick={() => onChange({ ...theme, cycleA: p.a, cycleB: p.b })}
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

export function ThemeSettings() {
  const { theme, setTheme, backgroundTheme, setBackgroundTheme } = useTheme()

  return (
    <div className="settings-page">
      <ColorSection
        title="Background"
        description="The animated backdrop behind Home. Its own color system, separate from the rest of the app."
        theme={backgroundTheme}
        onChange={setBackgroundTheme}
        onReset={() => setBackgroundTheme(DEFAULT_BACKGROUND_THEME)}
        presets={BG_PRESETS.map((p) => ({ label: p.label, solid: p.a }))}
        cyclePresets={BG_PRESETS}
        speedLabel={(s) => `${s}s per loop`}
        speedMin={4}
        speedMax={30}
      />

      <ColorSection
        title="Accent"
        description="Buttons, the seek bar, your active tab, and the wordmark — one color system, separate from the background."
        theme={theme}
        onChange={setTheme}
        onReset={() => setTheme(DEFAULT_THEME)}
        presets={PRESETS}
        cyclePresets={CYCLE_PRESETS}
        speedLabel={(s) => (theme.mode === 'pulse' ? `${s}s per beat` : `${s}s per loop`)}
        speedMin={2}
        speedMax={20}
      />
    </div>
  )
}
