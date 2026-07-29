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
  const playlistId = parseSpotifyPlaylistId(input) || input.trim()

  // 1. Fetch playlist title via Spotify's public oEmbed API
  const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/${playlistId}`
  const oembedRes = await fetch(oembedUrl)

  if (!oembedRes.ok) {
    throw new Error('Could not fetch Spotify playlist. Make sure it is public.')
  }

  const oembedData = await oembedRes.json()
  let tracks: SpotifyTrack[] = []

  // 2. Fetch tracklist directly from Spotify's public Embed API (No API key needed)
  try {
    const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`)
    if (embedRes.ok) {
      const html = await embedRes.text()
      // Extract the embedded JSON state from the iframe source
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
      
      if (match && match[1]) {
        const jsonData = JSON.parse(match[1])
        const rawTracks = jsonData?.props?.pageProps?.state?.data?.entity?.trackList || []
        
        tracks = rawTracks.map((item: any) => ({
          title: item.title || item.name || 'Unknown Track',
          artist: item.subtitle || item.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
        }))
      }
    }
  } catch (err) {
    console.warn('Embed fetch failed, falling back to proxy:', err)
  }

  // Backup fallback using CORS proxy if direct embed fetch is blocked
  if (tracks.length === 0) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
        `https://open.spotify.com/embed/playlist/${playlistId}`
      )}`
      const proxyRes = await fetch(proxyUrl)
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json()
        const match = proxyData.contents.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
        if (match && match[1]) {
          const jsonData = JSON.parse(match[1])
          const rawTracks = jsonData?.props?.pageProps?.state?.data?.entity?.trackList || []
          tracks = rawTracks.map((item: any) => ({
            title: item.title || item.name || 'Unknown Track',
            artist: item.subtitle || item.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
          }))
        }
      }
    } catch (e) {
      console.warn('Fallback failed as well:', e)
    }
  }

  if (tracks.length === 0) {
    throw new Error('No playable tracks found in this playlist.')
  }

  return {
    name: oembedData.title || 'Imported Spotify Playlist',
    tracks,
  }
}
