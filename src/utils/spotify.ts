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

/** Fetches public playlist details and tracks without requiring Spotify credentials */
export async function fetchSpotifyPlaylist(
  input: string,
  _clientId?: string,
  _clientSecret?: string
): Promise<SpotifyPlaylistData> {
  // Extract clean ID if full URL was passed directly
  const playlistId = parseSpotifyPlaylistId(input) || input.trim()

  // 1. Fetch metadata (Title/Name) via Spotify's public oEmbed endpoint
  const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`
  const oembedRes = await fetch(oembedUrl)

  if (!oembedRes.ok) {
    throw new Error('Could not fetch Spotify playlist. Make sure it is public.')
  }

  const oembedData = await oembedRes.json()

  // 2. Fetch track details by reading the public HTML page through a CORS proxy
  let tracks: SpotifyTrack[] = []
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
      `https://open.spotify.com/playlist/${playlistId}`
    )}`
    const pageRes = await fetch(proxyUrl)

    if (pageRes.ok) {
      const pageData = await pageRes.json()
      const html = pageData.contents

      // Extract track names and artists from meta tags embedded in the page
      const matches = [...html.matchAll(/<meta property="music:song" content="([^"]+)"\/>/g)]

      tracks = matches.map((m) => {
        const fullContent = m[1] // Format: "Track Name by Artist Name"
        const parts = fullContent.split(' by ')
        return {
          title: parts[0] || fullContent,
          artist: parts[1] || 'Unknown Artist',
        }
      })
    }
  } catch (err) {
    console.warn('Could not scrape track list, returning playlist name only:', err)
  }

  return {
    name: oembedData.title || 'Imported Spotify Playlist',
    tracks,
  }
}
