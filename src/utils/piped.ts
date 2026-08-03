import type { Track } from '../types'

/**
 * Public Piped instances. These are volunteer-run and go down / change fairly
 * often — if search stops working across the board, check
 * https://github.com/TeamPiped/Piped/wiki/Instances for a current list and
 * update this array. Kept in priority order; each search tries them in turn
 * until one responds.
 */
export const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.drgns.space',
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


/**
 * Build a list of recommended tracks similar to the given seeds.
 * Uses Piped music search seeded by artists / titles from the playlist.
 * `excludeIds` skips tracks already in the playlist (or current queue).
 * `salt` changes which seeds are picked so Refresh returns a different set.
 */
export async function fetchSimilarTracks(
  seeds: Track[],
  excludeIds: Set<string> = new Set(),
  limit = 12,
  salt = 0
): Promise<Track[]> {
  if (!seeds.length) return []

  // Rotate / shuffle seed selection based on salt for variety on refresh
  const rotated = [...seeds]
  const offset = salt % rotated.length
  const ordered = rotated.slice(offset).concat(rotated.slice(0, offset))

  // Prefer distinct artists for broader recommendations
  const seenArtists = new Set<string>()
  const picks: Track[] = []
  for (const t of ordered) {
    const key = (t.artist || '').toLowerCase()
    if (key && seenArtists.has(key)) continue
    if (key) seenArtists.add(key)
    picks.push(t)
    if (picks.length >= 4) break
  }
  if (!picks.length) picks.push(ordered[0])

  const queries: string[] = []
  for (const t of picks) {
    if (t.artist) queries.push(t.artist)
    // Mix in title-based searches for variety on refresh
    if (salt % 2 === 1 && t.title) {
      queries.push(`${t.artist} ${t.title.split(/[-(|]/)[0].trim()}`.trim())
    }
  }
  // Deduplicate queries
  const uniqueQueries = [...new Set(queries.filter(Boolean))].slice(0, 4)

  const results = await Promise.all(
    uniqueQueries.map((q) => searchPipedTracksSimple(q).catch(() => [] as Track[]))
  )

  const out: Track[] = []
  const seen = new Set(excludeIds)
  for (const batch of results) {
    for (const t of batch) {
      if (seen.has(t.videoId)) continue
      seen.add(t.videoId)
      out.push(t)
      if (out.length >= limit) return out
    }
  }
  return out
}


export interface ArtistChannelInfo {
  id: string
  name: string
  description: string
  avatarUrl: string
  bannerUrl: string
  subscribers: number | null
}

/** Rewrite Piped image proxy URLs to direct yt3 hosts at a larger size. */
function upgradeImageUrl(url: string | undefined | null, kind: 'avatar' | 'banner'): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    const host = u.searchParams.get('host')
    // path is /{id}=s160-... or /{id}=w2560-...
    let path = u.pathname.replace(/^\//, '')
    if (kind === 'avatar') {
      path = path.replace(/=s\d+/, '=s1200')
    } else {
      path = path.replace(/=w\d+/, '=w2560')
      if (!path.includes('=w')) path = path.includes('=') ? path : `${path}=w2560`
    }
    if (host) return `https://${host}/${path}`
    // already direct
    if (url.includes('yt3.')) {
      return kind === 'avatar'
        ? url.replace(/=s\d+/, '=s1200')
        : url.replace(/=w\d+/, '=w2560')
    }
    return url
  } catch {
    return url
  }
}

/**
 * Resolve a YouTube channel for an artist name via Piped (no API key).
 * Prefers exact verified name matches with the most subscribers.
 */
export async function fetchArtistChannel(artist: string): Promise<ArtistChannelInfo | null> {
  const q = encodeURIComponent(artist.trim())
  let data: any = null
  try {
    data = await pipedFetch(`/search?q=${q}&filter=channels`)
  } catch {
    return null
  }
  const items: any[] = data?.items || []
  if (!items.length) return null

  const lower = artist.trim().toLowerCase()
  const scored = items
    .filter((it) => it?.type === 'channel' || it?.url?.includes('/channel/'))
    .map((it) => {
      const name = String(it.name || '')
      const nameL = name.toLowerCase()
      let score = Number(it.subscribers) || 0
      if (nameL === lower) score += 1e12
      else if (nameL.startsWith(lower)) score += 1e10
      else if (nameL.includes(lower)) score += 1e8
      if (it.verified) score += 1e9
      return { it, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = scored[0]?.it
  if (!best) return null

  const idMatch = /\/channel\/([^/?]+)/.exec(String(best.url || ''))
  const id = idMatch?.[1] || ''

  // Prefer full channel endpoint for banner
  let bannerUrl = ''
  let avatarUrl = upgradeImageUrl(best.thumbnail, 'avatar')
  let description = String(best.description || '')
  let subscribers: number | null = Number(best.subscribers) || null
  let name = String(best.name || artist)

  if (id) {
    try {
      const ch = await pipedFetch(`/channel/${id}`)
      if (ch) {
        name = ch.name || name
        description = ch.description || description
        avatarUrl = upgradeImageUrl(ch.avatarUrl, 'avatar') || avatarUrl
        bannerUrl = upgradeImageUrl(ch.bannerUrl, 'banner')
        if (typeof ch.subscriberCount === 'number') subscribers = ch.subscriberCount
        else if (typeof ch.subscribers === 'number') subscribers = ch.subscribers
      }
    } catch {
      /* avatar-only is fine */
    }
  }

  return {
    id,
    name,
    description,
    avatarUrl,
    bannerUrl,
    subscribers,
  }
}
