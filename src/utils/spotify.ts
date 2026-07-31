// src/utils/spotify.ts
//
// Talks to Spotify directly from the browser using the logged-in user's access
// token (see spotifyAuth.ts). Spotify's Web API allows CORS from browsers for
// exactly this reason — no server proxy needed once you have a user token.

export interface SpotifyTrack {
  title: string
  artist: string
}

export interface SpotifyPlaylistData {
  name: string
  tracks: SpotifyTrack[]
}

export interface SpotifyPlaylistSummary {
  id: string
  name: string
  trackCount: number
  image: string | null
}

/** Extracts playlist ID from a Spotify URL, URI, or raw ID */
export function parseSpotifyPlaylistId(input: string): string | null {
  if (!input) return null
  const cleanInput = input.trim()
  const urlMatch = cleanInput.match(/playlist[/:]([a-zA-Z0-9]+)/)
  if (urlMatch) return urlMatch[1]
  if (/^[a-zA-Z0-9]{22}$/.test(cleanInput)) return cleanInput
  return null
}

/** Lists every playlist in the logged-in user's library (owned + followed). */
export async function fetchUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  const playlists: SpotifyPlaylistSummary[] = []
  let nextUrl: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50'

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error('Could not load your Spotify playlists.')
    const data = await res.json()
    for (const pl of data.items ?? []) {
      if (!pl) continue
      playlists.push({
        id: pl.id,
        name: pl.name,
        trackCount: pl.tracks?.total ?? 0,
        image: pl.images?.[0]?.url ?? null,
      })
    }
    nextUrl = data.next
  }

  return playlists
}

/** Fetches a playlist's name and every track (any public playlist, or a private one you own/follow). */
export async function fetchSpotifyPlaylist(idOrUrl: string, accessToken: string): Promise<SpotifyPlaylistData> {
  const playlistId = parseSpotifyPlaylistId(idOrUrl) ?? idOrUrl
  if (!playlistId) throw new Error('Invalid Spotify playlist URL or ID.')

  const headers = { Authorization: `Bearer ${accessToken}` }

  const metaRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name`, { headers })
  if (metaRes.status === 404) {
    throw new Error('Playlist not found. Make sure the link is correct.')
  }
  if (!metaRes.ok) {
    throw new Error('Could not fetch playlist from Spotify.')
  }
  const meta = await metaRes.json()

  const tracks: SpotifyTrack[] = []
  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks` +
    `?fields=items(track(name,artists(name))),next&limit=100`

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers })
    if (!res.ok) break
    const page = await res.json()
    for (const item of page.items ?? []) {
      const track = item.track
      if (!track) continue // local files / removed tracks come back null
      tracks.push({
        title: track.name,
        artist: (track.artists ?? []).map((a: { name: string }) => a.name).join(', '),
      })
    }
    nextUrl = page.next
  }

  return { name: meta.name, tracks }
}
