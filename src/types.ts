export interface YouTubeSearchItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    thumbnails: {
      medium: { url: string }
      high?: { url: string }
    }
  }
}

export interface Track {
  videoId: string
  title: string
  artist: string
  thumbnail: string
  album?: string
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
}

export type RepeatMode = 'off' | 'all' | 'one'

export type ThemeMode = 'solid' | 'cycle' | 'pulse' | 'album'

/** Accent or background color system. `colors` holds 2–4 stops used by cycle/pulse. */
export interface ThemeState {
  mode: ThemeMode
  solid: string
  /** 2–4 colors for cycle / pulse modes */
  colors: string[]
  /** seconds for one full cycle/pulse */
  speed: number
}

/** Button outline only — independent of accent fill. */
export interface OutlineTheme {
  /** outline / border color */
  color: string
  /** border width in pixels (0 = none) */
  thickness: number
}

export const DEFAULT_THEME: ThemeState = {
  mode: 'solid',
  solid: '#f5f5f2',
  colors: ['#f5f5f2', '#7dd3fc'],
  speed: 6,
}

export const DEFAULT_BACKGROUND_THEME: ThemeState = {
  mode: 'cycle',
  solid: '#7c3aed',
  colors: ['#7c3aed', '#ec4899'],
  speed: 10,
}

export const DEFAULT_OUTLINE: OutlineTheme = {
  color: '#ffffff',
  thickness: 0,
}

/** Cinematic ambient layer (particles / embers / stars). */
export type AmbientStyle = 'off' | 'stars' | 'embers' | 'dust' | 'snow'

export interface AmbientTheme {
  enabled: boolean
  style: AmbientStyle
  color: string
  /** 0.2 – 2 density multiplier */
  density: number
  /** 0.3 – 2 speed multiplier */
  speed: number
  /** 0.05 – 0.8 opacity */
  opacity: number
}

export const DEFAULT_AMBIENT: AmbientTheme = {
  enabled: true,
  style: 'stars',
  color: '#ffffff',
  density: 1,
  speed: 1,
  opacity: 0.35,
}

/** Visual treatment for the background layer (Appearance → Background). */
export type BackgroundStyle = 'glow' | 'halftone'

export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = 'glow'

/** Home-screen active-lyric display (desktop / tablet only). */
export type SubtitleMode = 'solid' | 'gradient' | 'cycle' | 'album'
export type SubtitleGlitch = 'off' | 'subtle' | 'on_change'

export interface SubtitleTheme {
  enabled: boolean
  mode: SubtitleMode
  solid: string
  colors: string[]
  speed: number
  glitch: SubtitleGlitch
}

export const DEFAULT_SUBTITLE: SubtitleTheme = {
  enabled: true,
  mode: 'gradient',
  solid: '#e8e0ff',
  colors: ['#e8e0ff', '#c4b5fd', '#f0abfc', '#7dd3fc'],
  speed: 8,
  glitch: 'on_change',
}


/* ---------------- Auth ---------------- */

export interface StoredUser {
  id: string
  username: string
  /** bcrypt hash */
  passwordHash: string
  /** security question for password recovery */
  recoveryQuestion: string
  /** bcrypt hash of the recovery answer */
  recoveryAnswerHash: string
  createdAt: number
}

export interface SessionUser {
  id: string
  username: string
}
