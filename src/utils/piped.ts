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


/**
 * Tracks that actually belong to the artist (uploader matches the channel),
 * not random search hits that only mention the name.
 */

/**
 * Tracks that actually belong to the artist (uploader matches the channel),
 * not random search hits that only mention the name.
 */
export async function searchArtistTracks(artist: string): Promise<Track[]> {
  const channel = await fetchArtistChannel(artist)
  const channelName = (channel?.name || artist).trim()
  const channelId = channel?.id || ''

  const nameNorm = normalizeArtistName(channelName)
  const artistNorm = normalizeArtistName(artist)
  const matched: Track[] = []
  const seen = new Set<string>()

  const pushItem = (item: any) => {
    if (!item) return
    if (item.type === 'channel' || item.type === 'playlist') return
    const title = String(item.title || '')
    const duration = Number(item.duration) || 0
    if (item.isShort) return
    if (SHORTS_HASHTAG.test(title)) return
    if (duration > 0 && duration <= SHORTS_MAX_SECONDS) return

    const uploader = normalizeArtistName(String(item.uploaderName || item.uploader || ''))
    // Channel page items are always this artist; search items must match uploader
    const fromChannelPage = Boolean(item.__fromChannel)
    if (!fromChannelPage && !uploaderMatches(uploader, nameNorm, artistNorm)) return

    const url = String(item.url || '')
    const videoId =
      extractVideoId(url) ||
      (typeof item.videoId === 'string' ? item.videoId : null)
    if (!videoId || seen.has(videoId)) return
    seen.add(videoId)
    matched.push({
      videoId,
      title: title || 'Untitled',
      artist: channelName,
      thumbnail: String(
        item.thumbnail ||
          (item.thumbnailUrl as string) ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      ),
    })
  }

  // 1) Channel uploads (when Piped returns them)
  if (channelId) {
    try {
      const ch = await pipedFetch(`/channel/${channelId}`)
      const streams: any[] = ch?.relatedStreams || []
      for (const item of streams) {
        pushItem({ ...item, __fromChannel: true, uploaderName: channelName })
      }
    } catch {
      /* continue */
    }
  }

  // 2) Filtered search — uploader must be this artist
  if (matched.length < 8) {
    try {
      const data = await pipedFetch(
        `/search?q=${encodeURIComponent(artist.trim())}&filter=videos`
      )
      for (const item of data?.items || []) pushItem(item)
    } catch {
      /* ignore */
    }
  }

  // 3) Extra query: "Artist - Topic" / official style if still thin
  if (matched.length < 5) {
    try {
      const data = await pipedFetch(
        `/search?q=${encodeURIComponent(channelName + ' official')}&filter=videos`
      )
      for (const item of data?.items || []) pushItem(item)
    } catch {
      /* ignore */
    }
  }

  return matched
}

function normalizeArtistName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, '')
    .trim()
}

function uploaderMatches(uploader: string, channelNorm: string, artistNorm: string): boolean {
  if (!uploader) return false
  if (uploader === channelNorm || uploader === artistNorm) return true
  const stripped = uploader.replace(/official|vevo|topic|music/g, '')
  if (stripped === channelNorm || stripped === artistNorm) return true
  return false
}


export interface ArtistAlbum {
  id: string
  name: string
  thumbnail: string
  uploaderName: string
  videoCount: number
  year?: string
}

function playlistIdFromUrl(url: string): string | null {
  const m = /[?&]list=([a-zA-Z0-9_-]+)/.exec(url) || /\/playlists\/([a-zA-Z0-9_-]+)/.exec(url)
  return m ? m[1] : null
}

/** Albums / playlists associated with an artist (channel playlists preferred). */
export async function searchArtistAlbums(artist: string, channelId?: string): Promise<ArtistAlbum[]> {
  const channel = channelId ? null : await fetchArtistChannel(artist)
  const channelName = (channel?.name || artist).trim()
  const nameNorm = normalizeArtistName(channelName)
  const artistNorm = normalizeArtistName(artist)
  const albums: ArtistAlbum[] = []
  const seen = new Set<string>()

  const push = (item: any) => {
    if (!item) return
    const url = String(item.url || item.playlistId || '')
    const pid = playlistIdFromUrl(url) || (typeof item.id === 'string' ? item.id : null)
    if (!pid || seen.has(pid)) return
    const uploader = normalizeArtistName(String(item.uploaderName || item.uploader || ''))
    // Prefer this artist's own playlists; also allow title clearly about the artist
    const title = String(item.name || item.title || '')
    const titleNorm = normalizeArtistName(title)
    const owned = uploader === nameNorm || uploader === artistNorm
    const titled =
      titleNorm.includes(artistNorm) ||
      titleNorm.includes(nameNorm) ||
      title.toLowerCase().includes(artist.toLowerCase())
    if (!owned && !titled) return
    seen.add(pid)
    albums.push({
      id: pid,
      name: title || 'Album',
      thumbnail: String(item.thumbnail || item.thumbnailUrl || ''),
      uploaderName: String(item.uploaderName || item.uploader || channelName),
      videoCount: Number(item.videos || item.videoCount || 0) || 0,
    })
  }

  // Channel playlists tab via search
  const queries = [
    `${channelName} album`,
    `${channelName} アルバム`,
    `${channelName} best`,
    `${artist} playlist`,
  ]
  for (const q of queries) {
    if (albums.length >= 18) break
    try {
      const data = await pipedFetch(`/search?q=${encodeURIComponent(q)}&filter=playlists`)
      for (const item of data?.items || []) push(item)
    } catch {
      /* try next */
    }
  }

  // Prefer owned playlists first
  albums.sort((a, b) => {
    const ao = normalizeArtistName(a.uploaderName) === nameNorm ? 0 : 1
    const bo = normalizeArtistName(b.uploaderName) === nameNorm ? 0 : 1
    return ao - bo
  })
  return albums.slice(0, 18)
}

/** Load tracks for a YouTube playlist / album. */
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://vid.puffyan.us',
  'https://invidious.projectsegfau.lt',
]

export async function fetchPlaylistTracks(
  playlistId: string,
  youtubeApiKey?: string
): Promise<{
  name: string
  description: string
  thumbnail: string
  uploaderName: string
  tracks: Track[]
}> {
  const empty = {
    name: 'Album',
    description: '',
    thumbnail: '',
    uploaderName: '',
    tracks: [] as Track[],
  }

  // 1) Invidious — most reliable for playlist videos right now
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(`${base}/api/v1/playlists/${encodeURIComponent(playlistId)}`, {
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const data = await res.json()
      const videos: any[] = data?.videos || []
      if (!videos.length) continue
      const tracks: Track[] = []
      const seen = new Set<string>()
      for (const v of videos) {
        const videoId = String(v.videoId || v.video_id || '')
        if (!videoId || seen.has(videoId)) continue
        seen.add(videoId)
        tracks.push({
          videoId,
          title: String(v.title || 'Untitled'),
          artist: String(v.author || data?.author || ''),
          thumbnail:
            (Array.isArray(v.videoThumbnails) && v.videoThumbnails[0]?.url) ||
            `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        })
      }
      if (tracks.length) {
        return {
          name: String(data?.title || data?.name || 'Album'),
          description: String(data?.description || ''),
          thumbnail:
            String(data?.playlistThumbnail || data?.thumbnail || tracks[0]?.thumbnail || ''),
          uploaderName: String(data?.author || data?.uploader || ''),
          tracks,
        }
      }
    } catch {
      /* try next instance */
    }
  }

  // 2) YouTube Data API (when key is configured)
  if (youtubeApiKey) {
    try {
      const tracks: Track[] = []
      const seen = new Set<string>()
      let pageToken = ''
      let metaName = 'Album'
      let metaThumb = ''
      let metaDesc = ''
      let metaChannel = ''

      // playlist meta
      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(
            playlistId
          )}&key=${youtubeApiKey}`
        )
        if (metaRes.ok) {
          const meta = await metaRes.json()
          const sn = meta.items?.[0]?.snippet
          if (sn) {
            metaName = sn.title || metaName
            metaDesc = sn.description || ''
            metaChannel = sn.channelTitle || ''
            metaThumb =
              sn.thumbnails?.maxres?.url ||
              sn.thumbnails?.high?.url ||
              sn.thumbnails?.medium?.url ||
              ''
          }
        }
      } catch {
        /* optional */
      }

      for (let page = 0; page < 5; page++) {
        const url =
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(
            playlistId
          )}&key=${youtubeApiKey}` + (pageToken ? `&pageToken=${pageToken}` : '')
        const res = await fetch(url)
        if (!res.ok) break
        const data = await res.json()
        for (const item of data.items || []) {
          const videoId =
            item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId || ''
          if (!videoId || seen.has(videoId)) continue
          // skip private/deleted
          if (item?.snippet?.title === 'Private video' || item?.snippet?.title === 'Deleted video')
            continue
          seen.add(videoId)
          tracks.push({
            videoId,
            title: String(item?.snippet?.title || 'Untitled'),
            artist: String(item?.snippet?.videoOwnerChannelTitle || metaChannel || ''),
            thumbnail:
              item?.snippet?.thumbnails?.high?.url ||
              item?.snippet?.thumbnails?.medium?.url ||
              `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          })
        }
        pageToken = data.nextPageToken || ''
        if (!pageToken) break
      }
      if (tracks.length) {
        return {
          name: metaName,
          description: metaDesc,
          thumbnail: metaThumb || tracks[0]?.thumbnail || '',
          uploaderName: metaChannel,
          tracks,
        }
      }
    } catch (err) {
      console.warn('YouTube playlistItems failed', err)
    }
  }

  // 3) Piped (often empty relatedStreams, but try anyway)
  try {
    const data = await pipedFetch(`/playlists/${encodeURIComponent(playlistId)}`)
    const streams: any[] = data?.relatedStreams || data?.streams || []
    const tracks: Track[] = []
    const seen = new Set<string>()
    for (const item of streams) {
      const url = String(item.url || '')
      const videoId = extractVideoId(url) || (typeof item.videoId === 'string' ? item.videoId : null)
      if (!videoId || seen.has(videoId)) continue
      seen.add(videoId)
      tracks.push({
        videoId,
        title: String(item.title || 'Untitled'),
        artist: String(item.uploaderName || data?.uploader || ''),
        thumbnail: String(
          item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        ),
      })
    }
    if (tracks.length) {
      return {
        name: String(data?.name || 'Album'),
        description: String(data?.description || ''),
        thumbnail: String(data?.thumbnailUrl || data?.thumbnail || tracks[0]?.thumbnail || ''),
        uploaderName: String(data?.uploader || ''),
        tracks,
      }
    }
    // keep meta even if tracks empty — caller may search fallback
    if (data?.name) {
      empty.name = String(data.name)
      empty.uploaderName = String(data.uploader || '')
      empty.thumbnail = String(data.thumbnailUrl || data.thumbnail || '')
      empty.description = String(data.description || '')
    }
  } catch {
    /* ignore */
  }

  return empty
}

/** Load additional artist tracks beyond the first page (extra queries, still filtered). */
export async function searchArtistTracksMore(
  artist: string,
  already: Track[],
  salt = 0
): Promise<Track[]> {
  const channel = await fetchArtistChannel(artist)
  const channelName = (channel?.name || artist).trim()
  const nameNorm = normalizeArtistName(channelName)
  const artistNorm = normalizeArtistName(artist)
  const seen = new Set(already.map((t) => t.videoId))
  const extras: Track[] = []

  const queries = [
    `${channelName} 歌いました`,
    `${channelName} live`,
    `${channelName} official`,
    `${artist} MV`,
    `${artist} フル`,
  ]
  // rotate by salt
  const rotated = [...queries.slice(salt % queries.length), ...queries.slice(0, salt % queries.length)]

  for (const q of rotated) {
    if (extras.length >= 20) break
    try {
      const data = await pipedFetch(`/search?q=${encodeURIComponent(q)}&filter=videos`)
      for (const item of data?.items || []) {
        if (!item || item.type === 'channel' || item.type === 'playlist') continue
        const uploader = normalizeArtistName(String(item.uploaderName || ''))
        if (!uploaderMatches(uploader, nameNorm, artistNorm)) continue
        if (looksLikeShort(item as PipedStreamItem)) continue
        const track = toTrack(item as PipedStreamItem)
        if (!track || seen.has(track.videoId)) continue
        seen.add(track.videoId)
        extras.push({ ...track, artist: channelName })
      }
    } catch {
      /* next query */
    }
  }
  return extras
}
