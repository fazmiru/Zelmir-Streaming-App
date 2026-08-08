import type { CSSProperties, ReactNode } from 'react'
import { useTheme } from '../theme/ThemeContext'
import {
  DEFAULT_THEME,
  DEFAULT_BACKGROUND_THEME,
  DEFAULT_OUTLINE,
  DEFAULT_AMBIENT,
  DEFAULT_BACKGROUND_STYLE,
  DEFAULT_SUBTITLE,
  type ThemeState,
  type AmbientStyle,
  type BackgroundStyle,
  type SubtitleMode,
  type SubtitleGlitch,
  type SubtitleFxStyle,
} from '../types'
import {
  BackdropIcon,
  DropletIcon,
  FrameIcon,
  CaptionsIcon,
  ParticlesIcon,
  PlayIcon,
  ResetIcon,
} from './Icons'

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

function speedLabel(seconds: number) {
  return `${seconds}s per loop`
}

function pct(value: number, min: number, max: number) {
  if (max <= min) return 0
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

function sliderVars(value: number, min: number, max: number): CSSProperties {
  return { ['--progress' as string]: `${pct(value, min, max)}%` }
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className={`seg ${size === 'sm' ? 'seg-sm' : ''}`} role="group">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`seg-btn ${value === opt.id ? 'seg-btn-active accent-fill' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ColorChip({
  id,
  value,
  onChange,
  label,
}: {
  id?: string
  value: string
  onChange: (hex: string) => void
  label?: string
}) {
  return (
    <label className="color-chip" htmlFor={id}>
      <span className="color-chip-swatch" style={{ background: value }}>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label || 'Color'}
        />
      </span>
      <span className="color-hex">{value}</span>
    </label>
  )
}

function CardHead({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <header className="settings-card-head">
      <div className="settings-card-title-row">
        <span className="settings-card-icon" aria-hidden>
          {icon}
        </span>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </header>
  )
}

function ResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="reset-button" onClick={onClick}>
      <ResetIcon size={13} />
      <span>{label}</span>
    </button>
  )
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="set-group-label">{children}</p>
}

function ColorPickers({
  theme,
  onChange,
  cyclePresets,
  idPrefix,
}: {
  theme: ThemeState
  onChange: (next: ThemeState) => void
  cyclePresets: { label: string; colors: string[] }[]
  idPrefix: string
}) {
  const colors = theme.colors?.length >= 2 ? theme.colors : [theme.solid, theme.solid]
  const setColorAt = (index: number, value: string) => {
    const next = [...colors]
    next[index] = value
    onChange({ ...theme, colors: next })
  }
  const addColor = () => {
    if (colors.length >= 4) return
    onChange({ ...theme, colors: [...colors, colors[colors.length - 1] ?? theme.solid] })
  }
  const removeColor = (index: number) => {
    if (colors.length <= 2) return
    onChange({ ...theme, colors: colors.filter((_, i) => i !== index) })
  }

  if (theme.mode === 'solid') {
    return (
      <div className="set-block">
        <span className="set-label">Color</span>
        <ColorChip
          id={`${idPrefix}-solid`}
          value={theme.solid}
          onChange={(hex) => onChange({ ...theme, solid: hex })}
          label="Solid color"
        />
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="preset-swatch"
              style={{ background: p.solid }}
              title={p.label}
              onClick={() => onChange({ ...theme, solid: p.solid })}
            />
          ))}
        </div>
      </div>
    )
  }

  if (theme.mode === 'album') {
    return (
      <div className="set-block">
        <label className="set-label" htmlFor={`${idPrefix}-album-speed`}>
          Cycle speed — {speedLabel(theme.speed)}
        </label>
        <input
          id={`${idPrefix}-album-speed`}
          type="range"
          min={2}
          max={16}
          value={theme.speed}
          onChange={(e) => onChange({ ...theme, speed: Number(e.target.value) })}
          className="accent-range set-slider"
          style={sliderVars(theme.speed, 2, 16)}
        />
      </div>
    )
  }

  return (
    <div className="set-block">
      <p className="set-label">Palette</p>
      <div className="color-list">
        {colors.map((c, i) => (
          <div key={i} className="color-list-row">
            <ColorChip
              id={`${idPrefix}-c${i}`}
              value={c}
              onChange={(hex) => setColorAt(i, hex)}
              label={`Color ${String.fromCharCode(65 + i)}`}
            />
            {colors.length > 2 && (
              <button type="button" className="color-remove-btn" onClick={() => removeColor(i)} title="Remove color" aria-label="Remove color">
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {colors.length < 4 && (
        <button type="button" className="add-color-btn" onClick={addColor}>
          + Add color
        </button>
      )}
      <label className="set-label" htmlFor={`${idPrefix}-speed`}>
        {theme.mode === 'pulse' ? 'Pulse speed' : 'Cycle speed'} — {speedLabel(theme.speed)}
      </label>
      <input
        id={`${idPrefix}-speed`}
        type="range"
        min={2}
        max={16}
        value={theme.speed}
        onChange={(e) => onChange({ ...theme, speed: Number(e.target.value) })}
        className="accent-range set-slider"
        style={sliderVars(theme.speed, 2, 16)}
      />
      <p className="set-label">Presets</p>
      <div className="preset-row">
        {cyclePresets.map((p) => (
          <button
            key={p.label}
            type="button"
            className="preset-swatch preset-swatch-split"
            title={p.label}
            style={{
              background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1] ?? p.colors[0]})`,
            }}
            onClick={() =>
              onChange({
                ...theme,
                colors: p.colors,
                mode: theme.mode === 'pulse' ? 'pulse' : 'cycle',
              })
            }
          />
        ))}
      </div>
    </div>
  )
}

function ModeAndSource({
  theme,
  onChange,
}: {
  theme: ThemeState
  onChange: (next: ThemeState) => void
}) {
  const mainMode = theme.mode === 'album' ? 'cycle' : theme.mode
  return (
    <>
      <Segmented
        value={mainMode as 'solid' | 'cycle' | 'pulse'}
        options={[
          { id: 'solid', label: 'Solid' },
          { id: 'cycle', label: 'Cycling' },
          { id: 'pulse', label: 'Pulse' },
        ]}
        onChange={(id) =>
          onChange({
            ...theme,
            mode: id === 'cycle' && theme.mode === 'album' ? 'album' : id,
          })
        }
      />
      {(theme.mode === 'cycle' || theme.mode === 'album') && (
        <div className="set-block set-block-tight">
          <p className="set-label">Color source</p>
          <Segmented
            size="sm"
            value={theme.mode === 'album' ? 'album' : 'custom'}
            options={[
              { id: 'custom', label: 'Custom' },
              { id: 'album', label: 'Song album' },
            ]}
            onChange={(id) => onChange({ ...theme, mode: id === 'album' ? 'album' : 'cycle' })}
          />
          {theme.mode === 'album' && (
            <p className="set-hint">Uses colors from the currently playing cover.</p>
          )}
        </div>
      )}
    </>
  )
}

export function ThemeSettings() {
  const {
    theme,
    setTheme,
    backgroundTheme,
    setBackgroundTheme,
    backgroundStyle,
    setBackgroundStyle,
    outline,
    setOutline,
    ambient,
    setAmbient,
    subtitle,
    setSubtitle,
  } = useTheme()

  return (
    <div className="settings-page appearance-bento">
      <h3 className="settings-cat">Colors &amp; backdrop</h3>
      <div className="settings-bento">
        <section className="settings-card settings-card-backdrop">
          <CardHead
            icon={<BackdropIcon size={18} />}
            title="Backdrop"
            description="Home background colors and visual treatment."
          />
          <div className="settings-card-body settings-card-split">
            <div className="settings-card-col">
              <p className="set-label">Colors</p>
              <ModeAndSource theme={backgroundTheme} onChange={setBackgroundTheme} />
              <ColorPickers
                theme={backgroundTheme}
                onChange={setBackgroundTheme}
                cyclePresets={BG_PRESETS}
                idPrefix="bg"
              />
              <ResetButton label="Reset to default" onClick={() => setBackgroundTheme(DEFAULT_BACKGROUND_THEME)} />
            </div>
            <div className="settings-card-col settings-card-col-divider">
              <p className="set-label">Effect</p>
              <Segmented
                value={backgroundStyle}
                options={[
                  { id: 'glow' as BackgroundStyle, label: 'Glow orbs' },
                  { id: 'halftone' as BackgroundStyle, label: 'Halftone mesh' },
                ]}
                onChange={(id) => setBackgroundStyle(id)}
              />
              <p className="set-hint">Soft orbs or a dotted mesh over the gradient.</p>
              <ResetButton label="Reset to default" onClick={() => setBackgroundStyle(DEFAULT_BACKGROUND_STYLE)} />
            </div>
          </div>
        </section>

        <section className="settings-card">
          <CardHead
            icon={<DropletIcon size={18} />}
            title="Accent"
            description="Play button, seek bar, active tabs, and wordmark."
          />
          <div className="settings-card-body">
            <ModeAndSource theme={theme} onChange={setTheme} />
            <ColorPickers
              theme={theme}
              onChange={setTheme}
              cyclePresets={CYCLE_PRESETS}
              idPrefix="accent"
            />
            <ResetButton label="Reset to default" onClick={() => setTheme(DEFAULT_THEME)} />
          </div>
        </section>
      </div>

      <h3 className="settings-cat">Playback</h3>
      <div className="settings-bento">
        <section className="settings-card">
          <CardHead
            icon={<FrameIcon size={18} />}
            title="Button outline"
            description="Border around accent buttons. Independent of fill color."
          />
          <div className="settings-card-body">
            <div className="set-block">
              <span className="set-label">Outline color</span>
              <ColorChip
                id="outline-color"
                value={outline.color}
                onChange={(hex) => setOutline({ ...outline, color: hex })}
                label="Outline color"
              />
            </div>
            <div className="set-block">
              <label className="set-label" htmlFor="outline-width">
                Thickness — {outline.thickness}px
              </label>
              <input
                id="outline-width"
                type="range"
                min={0}
                max={4}
                step={1}
                value={outline.thickness}
                onChange={(e) => setOutline({ ...outline, thickness: Number(e.target.value) })}
                className="accent-range set-slider"
                style={sliderVars(outline.thickness, 0, 4)}
              />
            </div>
            <div className="outline-preview-row">
              <span className="set-label" style={{ margin: 0 }}>
                Preview
              </span>
              <button type="button" className="outline-preview-btn accent-fill">
                Button
              </button>
              <button type="button" className="outline-preview-play accent-fill" aria-label="Play preview">
                <PlayIcon size={14} />
              </button>
            </div>
            <ResetButton label="Reset to default" onClick={() => setOutline(DEFAULT_OUTLINE)} />
          </div>
        </section>
      </div>

      <h3 className="settings-cat">Effects &amp; lyrics</h3>
      <div className="settings-bento">
        <section className="settings-card">
          <CardHead
            icon={<ParticlesIcon size={18} />}
            title="Ambient particles"
            description="Soft particles over the app — stars, embers, dust, or snow."
          />
          <div className="settings-card-body">
            <Segmented
              value={ambient.enabled ? 'on' : 'off'}
              options={[
                { id: 'on', label: 'On' },
                { id: 'off', label: 'Off' },
              ]}
              onChange={(id) => setAmbient({ ...ambient, enabled: id === 'on' })}
            />
            {ambient.enabled && (
              <>
                <div className="set-block">
                  <p className="set-label">Style</p>
                  <Segmented
                    size="sm"
                    value={ambient.style === 'off' ? 'stars' : ambient.style}
                    options={[
                      { id: 'stars' as AmbientStyle, label: 'Stars' },
                      { id: 'embers' as AmbientStyle, label: 'Embers' },
                      { id: 'dust' as AmbientStyle, label: 'Dust' },
                      { id: 'snow' as AmbientStyle, label: 'Snow' },
                    ]}
                    onChange={(id) => setAmbient({ ...ambient, style: id })}
                  />
                </div>
                <div className="set-block">
                  <span className="set-label">Color</span>
                  <ColorChip
                    id="amb-color"
                    value={ambient.color}
                    onChange={(hex) => setAmbient({ ...ambient, color: hex })}
                    label="Particle color"
                  />
                </div>
                <div className="set-block">
                  <label className="set-label" htmlFor="amb-density">
                    Density — {ambient.density.toFixed(1)}x
                  </label>
                  <input
                    id="amb-density"
                    type="range"
                    min={0.4}
                    max={2.4}
                    step={0.1}
                    value={ambient.density}
                    onChange={(e) => setAmbient({ ...ambient, density: Number(e.target.value) })}
                    className="accent-range set-slider"
                    style={sliderVars(ambient.density, 0.4, 2.4)}
                  />
                </div>
                <div className="set-block">
                  <label className="set-label" htmlFor="amb-speed">
                    Speed — {ambient.speed.toFixed(1)}x
                  </label>
                  <input
                    id="amb-speed"
                    type="range"
                    min={0.3}
                    max={2.5}
                    step={0.1}
                    value={ambient.speed}
                    onChange={(e) => setAmbient({ ...ambient, speed: Number(e.target.value) })}
                    className="accent-range set-slider"
                    style={sliderVars(ambient.speed, 0.3, 2.5)}
                  />
                </div>
                <div className="set-block">
                  <label className="set-label" htmlFor="amb-opacity">
                    Opacity — {Math.round(ambient.opacity * 100)}%
                  </label>
                  <input
                    id="amb-opacity"
                    type="range"
                    min={0.15}
                    max={1}
                    step={0.05}
                    value={ambient.opacity}
                    onChange={(e) => setAmbient({ ...ambient, opacity: Number(e.target.value) })}
                    className="accent-range set-slider"
                    style={sliderVars(ambient.opacity, 0.15, 1)}
                  />
                </div>
              </>
            )}
            <ResetButton label="Reset to default" onClick={() => setAmbient(DEFAULT_AMBIENT)} />
          </div>
        </section>

        <section className="settings-card settings-card-wide">
          <CardHead
            icon={<CaptionsIcon size={18} />}
            title="Home lyrics"
            description="Active line on the home screen (desktop & iPad) with optional cinematic styles."
          />
          <div className="settings-card-body settings-card-lyrics">
            <div className="settings-card-col">
              <p className="set-label">Enabled</p>
              <Segmented
                value={subtitle.enabled ? 'on' : 'off'}
                options={[
                  { id: 'on', label: 'On' },
                  { id: 'off', label: 'Off' },
                ]}
                onChange={(id) => setSubtitle({ ...subtitle, enabled: id === 'on' })}
              />

              {subtitle.enabled && (
                <div className="set-block">
                  <p className="set-label">Color style</p>
                  <Segmented
                    size="sm"
                    value={subtitle.mode}
                    options={[
                      { id: 'solid' as SubtitleMode, label: 'Solid' },
                      { id: 'gradient' as SubtitleMode, label: 'Gradient' },
                      { id: 'cycle' as SubtitleMode, label: 'Cycling' },
                      { id: 'album' as SubtitleMode, label: 'Song album' },
                    ]}
                    onChange={(id) => setSubtitle({ ...subtitle, mode: id })}
                  />
                  {subtitle.mode === 'album' && (
                    <p className="set-hint">Uses the currently playing track&apos;s cover colors.</p>
                  )}
                  {subtitle.mode === 'solid' && (
                    <ColorChip
                      value={subtitle.solid}
                      onChange={(hex) => setSubtitle({ ...subtitle, solid: hex })}
                      label="Subtitle solid"
                    />
                  )}
                  {(subtitle.mode === 'gradient' || subtitle.mode === 'cycle') && (
                    <div className="set-block set-block-tight">
                      {(subtitle.colors?.length >= 2
                        ? subtitle.colors
                        : [subtitle.solid, subtitle.solid]
                      )
                        .slice(0, 4)
                        .map((c, i) => (
                          <ColorChip
                            key={i}
                            value={c}
                            onChange={(hex) => {
                              const cols = [
                                ...(subtitle.colors?.length >= 2
                                  ? subtitle.colors
                                  : [subtitle.solid, subtitle.solid]),
                              ]
                              cols[i] = hex
                              setSubtitle({ ...subtitle, colors: cols })
                            }}
                            label={`Subtitle color ${i + 1}`}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {subtitle.enabled && (
              <div className="settings-card-col settings-card-col-divider">
                <div className="set-block">
                  <p className="set-label">Style</p>
                  <div className="style-picker" role="radiogroup" aria-label="Lyric style">
                    {(
                      [
                        {
                          id: 'classic' as SubtitleFxStyle,
                          title: 'Glitch',
                          desc: 'Subtle cyber flicker on the active line',
                        },
                        {
                          id: 'cinematic' as SubtitleFxStyle,
                          title: 'Cinematic',
                          desc: 'Soft glow, ghost type, bloom',
                        },
                        {
                          id: 'cinematic2' as SubtitleFxStyle,
                          title: 'Music video',
                          desc: 'Kinetic letters, VHS tears, dust',
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={subtitle.fxStyle === opt.id}
                        className={`style-picker-item ${subtitle.fxStyle === opt.id ? 'style-picker-item-active' : ''}`}
                        onClick={() => setSubtitle({ ...subtitle, fxStyle: opt.id })}
                      >
                        <span className="style-picker-title">{opt.title}</span>
                        <span className="style-picker-desc">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="set-block">
                  <p className="set-label">Glitch</p>
                  <Segmented
                    size="sm"
                    value={subtitle.glitch}
                    options={[
                      { id: 'off' as SubtitleGlitch, label: 'Off' },
                      { id: 'on_change' as SubtitleGlitch, label: 'On line change' },
                      { id: 'subtle' as SubtitleGlitch, label: 'Occasional' },
                    ]}
                    onChange={(id) => setSubtitle({ ...subtitle, glitch: id })}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="settings-card-body" style={{ paddingTop: 0 }}>
            <ResetButton label="Reset to default" onClick={() => setSubtitle(DEFAULT_SUBTITLE)} />
          </div>
        </section>
      </div>
    </div>
  )
}
