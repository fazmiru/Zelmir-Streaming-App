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

export type ThemeMode = 'solid' | 'cycle'

export interface ThemeState {
  mode: ThemeMode
  solid: string
  cycleA: string
  cycleB: string
  /** seconds for one full cycle */
  speed: number
}

export const DEFAULT_THEME: ThemeState = {
  mode: 'solid',
  solid: '#f5f5f2',
  cycleA: '#f5f5f2',
  cycleB: '#7dd3fc',
  speed: 6,
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