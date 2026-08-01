import type { Track } from '../types'

/**
 * Public Piped instances. These are volunteer-run and go down / change fairly
 * often — if search stops working across the board, check
 * https://github.com/TeamPiped/Piped/wiki/Instances for a current list and
 * update this array. Kept in priority order; each search tries them in turn
 * until one responds.
 */
export const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://api.piped.private.coffee',
  'https://pipedapi.owo.si',
]

interface PipedStreamItem {
  url: string // "/watch?v=XXXXXXXXXXX"
  type: string // "stream" | "channel" | "playlist"
  title: string
  thumbnail: string
  uploaderName: string
  duration: number // seconds; -1 for livestreams
  isShort?: boolean
}

interface PipedSearchResponse {
  items: PipedStreamItem[]
  nextpage: string | null
}

function extractVideoId(url: string): string | null {
  const match = /[?&]v=([^&]+)/.exec(url)
  return match ? match[1] : null
}

function toTrack(item: PipedStreamItem): Track | null {
  const videoId = extractVideoId(item.url)
  if (!videoId) return null
  return {
    videoId,
    title: item.title,
    artist: item.uploaderName,
    thumbnail: item.thumbnail.startsWith('http') ? item.thumbnail : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  }
}

const SHORTS_HASHTAG = /#shorts?\b/i
const SHORTS_MAX_SECONDS = 60

function looksLikeShort(item: PipedStreamItem): boolean {
  if (item.isShort) return true
  if (SHORTS_HASHTAG.test(item.title)) return true
  if (item.duration > 0 && item.duration <= SHORTS_MAX_SECONDS) return true
  return false
}

/** Tries each Piped instance in turn until one returns a usable response. */
async function pipedFetch(path: string): Promise<any> {
  let lastError: unknown = null
  for (const instance of PIPED_INSTANCES) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(`${instance}${path}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`${instance} returned ${res.status}`)
      return await res.json()
    } catch (err) {
      lastError = err
      // try the next instance
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError ?? new Error('All Piped instances failed to respond.')
}

/**
 * Searches for songs via Piped (no API key, no quota). Filters out anything
 * that looks like a Short. Pass the `nextpage` token from a previous call to
 * load the next page of the same query.
 */
export async function searchPipedTracks(
  query: string,
  nextpage?: string | null
): Promise<{ tracks: Track[]; nextpage: string | null }> {
  const path = nextpage
    ? `/nextpage/search?q=${encodeURIComponent(query)}&filter=music_songs&nextpage=${encodeURIComponent(nextpage)}`
    : `/search?q=${encodeURIComponent(query)}&filter=music_songs`

  const data: PipedSearchResponse = await pipedFetch(path)

  const tracks = (data.items || [])
    .filter((item) => item.type === 'stream' && !looksLikeShort(item))
    .map(toTrack)
    .filter((t): t is Track => t !== null)

  return { tracks, nextpage: data.nextpage ?? null }
}

/** Convenience wrapper for one-off lookups (Flow, Recommended, Spotify import) that don't need pagination. */
export async function searchPipedTracksSimple(query: string): Promise<Track[]> {
  const { tracks } = await searchPipedTracks(query)
  return tracks
}
