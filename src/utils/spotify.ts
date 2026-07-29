// src/utils/spotify.ts

export interface SpotifyTrack {
  title: string
  artist: string
}

export interface SpotifyPlaylistData {
  name: string
  tracks: SpotifyTrack[]
}

export function parseSpotifyPlaylistId(url: string): string | null {
  if (!url) return null
  const match = url.trim().match(/playlist\/([a-zA-Z0-9]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9]{22}$/.test(url.trim())) return url.trim()
  return null
}

export async function fetchSpotifyPlaylist(input: string): Promise<SpotifyPlaylistData> {
  const playlistId = parseSpotifyPlaylistId(input)
  if (!playlistId) {
    throw new Error('Invalid Spotify playlist link.')
  }

  // Fetch track metadata from a public open API wrapper
  const res = await fetch(`https://api.spotifydown.com/metadata/playlist/${playlistId}`)
  
  if (!res.ok) {
    throw new Error('Could not fetch Spotify playlist. Make sure it is public.')
  }

  const data = await res.json()
  
  if (!data.success || !data.trackList || data.trackList.length === 0) {
    throw new Error('No playable tracks found in this playlist.')
  }

  const tracks: SpotifyTrack[] = data.trackList.map((t: any) => ({
    title: t.title || t.name,
    artist: t.artists || t.artist || 'Unknown Artist',
  }))

  return {
    name: data.title || 'Imported Spotify Playlist',
    tracks,
  }
}
