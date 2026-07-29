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

/** Primary Method: Fetch playlist tracks via spotifydown API */
async function fetchFromSpotifyDown(playlistId: string): Promise<SpotifyPlaylistData | null> {
  try {
    const res = await fetch(`https://api.spotifydown.com/metadata/playlist/${playlistId}`)
    if (!res.ok) return null

    const data = await res.json()
    if (!data.success || !data.trackList || data.trackList.length === 0) return null

    const tracks: SpotifyTrack[] = data.trackList.map((t: any) => ({
      title: t.title || t.name || 'Unknown Track',
      artist: t.artists || t.artist || 'Unknown Artist',
    }))

    return {
      name: data.title || 'Imported Spotify Playlist',
      tracks,
    }
  } catch (err) {
    console.warn('SpotifyDown API failed, switching to secondary fallback:', err)
    return null
  }
}

/** Secondary Method: Scrape Embed JSON state */
async function fetchFromEmbed(playlistId: string): Promise<SpotifyPlaylistData | null> {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(
      `https://open.spotify.com/embed/playlist/${playlistId}`
    )}`
    const res = await fetch(proxyUrl)
    if (!res.ok) return null

    const proxyData = await res.json()
    const match = proxyData.contents?.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    )

    if (match && match[1]) {
      const jsonData = JSON.parse(match[1])
      const rawTracks = jsonData?.props?.pageProps?.state?.data?.entity?.trackList || []

      if (rawTracks.length > 0) {
        const tracks: SpotifyTrack[] = rawTracks.map((item: any) => ({
          title: item.title || item.name || 'Unknown Track',
          artist:
            item.subtitle ||
            (Array.isArray(item.artists) ? item.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist'),
        }))

        return {
          name: jsonData?.props?.pageProps?.state?.data?.entity?.name || 'Imported Spotify Playlist',
          tracks,
        }
      }
    }
  } catch (err) {
    console.warn('Embed scraping failed:', err)
  }
  return null
}

/** Tertiary Method: Parse raw text (e.g., "Song Name - Artist Name" per line) */
export function parseTextPlaylist(text: string, playlistName = 'Imported Playlist'): SpotifyPlaylistData {
  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  const tracks: SpotifyTrack[] = lines.map((line) => {
    const cleanLine = line.replace(/^\d+[\.\s\-]+/, '').trim()

    if (cleanLine.includes(' - ')) {
      const [title, artist] = cleanLine.split(' - ')
      return { title: title.trim(), artist: artist ? artist.trim() : 'Unknown Artist' }
    } else if (cleanLine.includes(' by ')) {
      const [title, artist] = cleanLine.split(' by ')
      return { title: title.trim(), artist: artist ? artist.trim() : 'Unknown Artist' }
    }

    return { title: cleanLine, artist: 'Unknown Artist' }
  })

  return {
    name: playlistName,
    tracks,
  }
}

/** Main Entry Point: Resolves tracklist using available strategies */
export async function fetchSpotifyPlaylist(
  input: string,
  _clientId?: string,
  _clientSecret?: string
): Promise<SpotifyPlaylistData> {
  const playlistId = parseSpotifyPlaylistId(input)

  // If a playlist ID or link is provided, attempt online fetchers
  if (playlistId) {
    // 1. Try SpotifyDown API
    const spotifyDownResult = await fetchFromSpotifyDown(playlistId)
    if (spotifyDownResult && spotifyDownResult.tracks.length > 0) {
      return spotifyDownResult
    }

    // 2. Try Embed Fallback
    const embedResult = await fetchFromEmbed(playlistId)
    if (embedResult && embedResult.tracks.length > 0) {
      return embedResult
    }

    throw new Error('Could not extract tracks from this Spotify playlist. Make sure it is public.')
  }

  // 3. Fallback to parsing as raw text if multiple lines are provided
  if (input.includes('\n')) {
    const textResult = parseTextPlaylist(input)
    if (textResult.tracks.length > 0) {
      return textResult
    }
  }

  throw new Error('Invalid Spotify link or song list provided.')
}
