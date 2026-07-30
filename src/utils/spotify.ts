// src/utils/spotify.ts

export interface SpotifyTrack {
  title: string
  artist: string
}

export interface SpotifyPlaylistData {
  name: string
  tracks: SpotifyTrack[]
}

/** Extracts playlist ID from a Spotify URL or raw ID */
export function parseSpotifyPlaylistId(url: string): string | null {
  if (!url) return null
  const cleanInput = url.trim()
  const match = cleanInput.match(/playlist\/([a-zA-Z0-9]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9]{22}$/.test(cleanInput)) return cleanInput
  return null
}

/** Main Entry Point: Calls Vercel Serverless Function */
export async function fetchSpotifyPlaylist(input: string): Promise<SpotifyPlaylistData> {
  const playlistId = parseSpotifyPlaylistId(input)

  if (!playlistId) {
    throw new Error('Invalid Spotify playlist URL or ID.')
  }

  // Call the serverless function hosted at /api/spotify
  const res = await fetch(`/api/spotify?id=${playlistId}`)
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || 'Could not fetch Spotify playlist. Make sure it is public.')
  }

  return {
    name: data.name,
    tracks: data.tracks,
  }
}