import { useTheme } from '../theme/ThemeContext'
import { DEFAULT_THEME } from '../types'

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

export function ThemeSettings() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="settings-panel">
      <h2>Appearance</h2>
      <p className="settings-subtitle">
        Zelmir's whole accent, buttons, the seek bar, your active tab, is driven by one color system. Pick a single
        tone, or let two colors breathe into each other.
      </p>

      <div className="settings-mode-toggle">
        <button
          className={`mode-button ${theme.mode === 'solid' ? 'mode-button-active accent-fill' : ''}`}
          onClick={() => setTheme({ ...theme, mode: 'solid' })}
        >
          Solid
        </button>
        <button
          className={`mode-button ${theme.mode === 'cycle' ? 'mode-button-active accent-fill' : ''}`}
          onClick={() => setTheme({ ...theme, mode: 'cycle' })}
        >
          Cycling
        </button>
      </div>

      {theme.mode === 'solid' ? (
        <div className="settings-section">
          <label className="settings-label" htmlFor="solid-color">
            Custom color
          </label>
          <div className="color-row">
            <input
              id="solid-color"
              type="color"
              value={theme.solid}
              onChange={(e) => setTheme({ ...theme, solid: e.target.value })}
            />
            <span>{theme.solid}</span>
          </div>

          <p className="settings-label">Presets</p>
          <div className="preset-row">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="preset-swatch"
                style={{ background: p.solid }}
                title={p.label}
                onClick={() => setTheme({ ...theme, solid: p.solid })}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="settings-section">
          <label className="settings-label" htmlFor="color-a">
            Color A
          </label>
          <div className="color-row">
            <input
              id="color-a"
              type="color"
              value={theme.cycleA}
              onChange={(e) => setTheme({ ...theme, cycleA: e.target.value })}
            />
            <span>{theme.cycleA}</span>
          </div>

          <label className="settings-label" htmlFor="color-b">
            Color B
          </label>
          <div className="color-row">
            <input
              id="color-b"
              type="color"
              value={theme.cycleB}
              onChange={(e) => setTheme({ ...theme, cycleB: e.target.value })}
            />
            <span>{theme.cycleB}</span>
          </div>

          <label className="settings-label" htmlFor="speed">
            Cycle speed — {theme.speed}s per loop
          </label>
          <input
            id="speed"
            type="range"
            min={2}
            max={20}
            value={theme.speed}
            onChange={(e) => setTheme({ ...theme, speed: Number(e.target.value) })}
            className="accent-range"
          />

          <p className="settings-label">Presets</p>
          <div className="preset-row">
            {CYCLE_PRESETS.map((p) => (
              <button
                key={p.label}
                className="preset-swatch preset-swatch-split"
                style={{ background: `linear-gradient(90deg, ${p.a}, ${p.b})` }}
                title={p.label}
                onClick={() => setTheme({ ...theme, cycleA: p.a, cycleB: p.b })}
              />
            ))}
          </div>
        </div>
      )}

      <button className="reset-button" onClick={() => setTheme(DEFAULT_THEME)}>
        Reset to default
      </button>
    </div>
  )
}
