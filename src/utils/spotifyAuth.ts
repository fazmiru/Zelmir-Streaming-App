// src/utils/spotifyAuth.ts
//
// Spotify login using Authorization Code + PKCE — the flow Spotify recommends
// for browser apps. Unlike the old Client Credentials setup, this needs no
// client secret (PKCE replaces it with a one-time, per-login proof), so the
// whole thing runs client-side. The only thing it needs is a public Client ID.
//
// Requires VITE_SPOTIFY_CLIENT_ID to be set (WITH the VITE_ prefix this time —
// a Spotify Client ID isn't secret, so it's fine to ship to the browser).
//
// Setup in the Spotify Developer Dashboard (developer.spotify.com/dashboard):
//   1. Add a Redirect URI matching your app's origin exactly, e.g.
//      https://your-app.vercel.app/  and  http://127.0.0.1:5173/  for local dev.
//   2. While the app is in Development Mode, add every Spotify account that
//      should be able to log in under Settings -> User Management (up to 25).

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined
const SCOPES = 'playlist-read-private playlist-read-collaborative'
const STORAGE_KEY = 'zelmir-spotify-auth'
const VERIFIER_KEY = 'zelmir-spotify-pkce-verifier'

interface StoredAuth {
  accessToken: string
  refreshToken: string
  /** ms epoch, kept a minute early so we refresh before Spotify actually rejects it */
  expiresAt: number
}

function redirectUri(): string {
  return `${window.location.origin}/`
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return new Uint8Array(digest)
}

function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveAuth(auth: StoredAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

export function isSpotifyConnected(): boolean {
  return !!loadAuth()
}

export function disconnectSpotify() {
  localStorage.removeItem(STORAGE_KEY)
}

/** Redirects the browser to Spotify's login/consent screen. */
export async function startSpotifyLogin(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('Spotify login is not configured (missing VITE_SPOTIFY_CLIENT_ID).')
  }

  const verifierBytes = crypto.getRandomValues(new Uint8Array(64))
  const verifier = base64UrlEncode(verifierBytes)
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const challenge = base64UrlEncode(await sha256(verifier))

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`
}

/**
 * Call once when the app loads. If the URL is a Spotify login callback (has a
 * `code` param), completes the login and cleans the URL. Returns true if a
 * login was just completed.
 */
export async function handleSpotifyRedirect(): Promise<boolean> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (!code) return false

  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)

  // Strip the auth params either way so a refresh doesn't try to reuse a spent code.
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState({}, '', url.toString())

  if (!verifier || !CLIENT_ID) return false

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      }),
    })
    if (!res.ok) return false
    const data = await res.json()
    saveAuth({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
    })
    return true
  } catch {
    return false
  }
}

async function refreshAuth(auth: StoredAuth): Promise<StoredAuth | null> {
  if (!CLIENT_ID) return null
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const next: StoredAuth = {
      accessToken: data.access_token,
      // Spotify doesn't always send a new refresh token back — keep the old one if so.
      refreshToken: data.refresh_token ?? auth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
    }
    saveAuth(next)
    return next
  } catch {
    return null
  }
}

/** Returns a valid access token (refreshing first if needed), or null if not logged in. */
export async function getValidSpotifyToken(): Promise<string | null> {
  let auth = loadAuth()
  if (!auth) return null
  if (Date.now() >= auth.expiresAt) {
    auth = await refreshAuth(auth)
    if (!auth) {
      disconnectSpotify()
      return null
    }
  }
  return auth.accessToken
}
