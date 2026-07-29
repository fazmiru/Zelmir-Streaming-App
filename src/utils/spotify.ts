// src/utils/spotify.ts

/** Extracts playlist ID from a Spotify URL */
export function parseSpotifyPlaylistId(url: string): string | null {
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/)
  return match ? match[1] : null
}

/** Obtains an access token from Spotify using Client Credentials */
async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error('Failed to authenticate with Spotify API.')
  }

  const data = await response.json()
  return data.access_token
}

/** Fetches playlist details and tracks from Spotify */
export async function fetchSpotifyPlaylist(
  playlistId: string,
  clientId: string,
  clientSecret: string
): Promise<{ name: string; tracks: { title: string; artist: string }[] }> {
  const token = await getSpotifyToken(clientId, clientSecret)

  const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    throw new Error('Could not fetch Spotify playlist. Make sure it is public.')
  }

  const data = await response.json()

  const tracks = (data.tracks?.items || [])
    .filter((item: any) => item.track)
    .map((item: any) => ({
      title: item.track.name,
      artist: item.track.artists.map((a: any) => a.name).join(', '),
    }))

  return {
    name: data.name || 'Imported Spotify Playlist',
    tracks,
  }
}
