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
 * Fetch tracks similar to a playlist's overall mix.
 * - Seeds are spread across distinct artists (not dominated by one name).
 * - Results are interleaved so no single artist fills the whole list.
 * - `salt` + prior-exclude make Refresh return different tracks.
 */
export async function fetchSimilarTracks(
  seeds: Track[],
  excludeIds: Set<string> = new Set(),
  limit = 12,
  salt = 0
): Promise<Track[]> {
  if (!seeds.length) return []

  // Artist frequency in the playlist (majority signal)
  const freq = new Map<string, number>()
  for (const t of seeds) {
    const a = (t.artist || '').trim()
    if (!a) continue
    const key = a.toLowerCase()
    freq.set(key, (freq.get(key) || 0) + 1)
  }

  // One representative track per artist, ordered by frequency then salt-rotated
  const byArtist = new Map<string, Track>()
  for (const t of seeds) {
    const key = (t.artist || '').trim().toLowerCase()
    if (!key) continue
    if (!byArtist.has(key)) byArtist.set(key, t)
  }
  let artistTracks = [...byArtist.values()].sort((a, b) => {
    const fa = freq.get((a.artist || '').toLowerCase()) || 0
    const fb = freq.get((b.artist || '').toLowerCase()) || 0
    return fb - fa
  })
  if (artistTracks.length > 1) {
    const off = salt % artistTracks.length
    artistTracks = artistTracks.slice(off).concat(artistTracks.slice(0, off))
  }

  // Take up to 6 distinct artists so the mix matches a multi-artist playlist
  const picks = artistTracks.slice(0, Math.min(6, Math.max(3, artistTracks.length)))

  // Query templates — salt rotates which style we use so refresh varies
  const templates = salt % 3
  const queries: string[] = []
  for (let i = 0; i < picks.length; i++) {
    const t = picks[i]
    const artist = (t.artist || '').trim()
    const titleCore = (t.title || '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .split(/[-–—|/]/)[0]
      .trim()
      .slice(0, 48)

    if (templates === 0) {
      // artist-focused
      if (artist) queries.push(artist)
      if (artist && titleCore) queries.push(`${artist} ${titleCore}`)
    } else if (templates === 1) {
      // song-focused + related mix
      if (artist && titleCore) queries.push(`${titleCore} ${artist}`)
      if (artist) queries.push(`${artist} mix`)
      if (artist) queries.push(`${artist} similar`)
    } else {
      // broader: official / live / playlist vibes
      if (artist) queries.push(`${artist} official`)
      if (titleCore) queries.push(titleCore)
      if (artist && titleCore) queries.push(`${artist} ${titleCore}`)
    }
  }

  // Dedupe while preserving order; cap queries
  const seenQ = new Set<string>()
  const uniqueQueries: string[] = []
  for (const q of queries) {
    const k = q.toLowerCase()
    if (!q || seenQ.has(k)) continue
    seenQ.add(k)
    uniqueQueries.push(q)
    if (uniqueQueries.length >= 8) break
  }
  if (!uniqueQueries.length && picks[0]?.artist) {
    uniqueQueries.push(picks[0].artist)
  }

  const results = await Promise.all(
    uniqueQueries.map((q) => searchPipedTracksSimple(q).catch(() => [] as Track[]))
  )

  // Interleave batches so one artist (e.g. Ado) can't fill all 12 slots
  const seen = new Set(excludeIds)
  const out: Track[] = []
  const artistCount = new Map<string, number>()
  const maxPerArtist = Math.max(2, Math.ceil(limit / Math.max(3, picks.length)))

  // Soft-skip first few hits on later refreshes so Piped's ranking doesn't repeat
  const skipFront = Math.min(6, (salt % 5) * 2)

  let progressed = true
  let round = 0
  while (out.length < limit && progressed && round < 30) {
    progressed = false
    for (const batch of results) {
      if (out.length >= limit) break
      const startIdx = Math.min(skipFront, Math.max(0, batch.length - 1))
      // Prefer items from startIdx onward first; then wrap
      const order = [
        ...batch.slice(startIdx),
        ...batch.slice(0, startIdx),
      ]
      for (const track of order) {
        if (seen.has(track.videoId)) continue
        const aKey = (track.artist || '').toLowerCase()
        const n = artistCount.get(aKey) || 0
        if (aKey && n >= maxPerArtist) continue
        seen.add(track.videoId)
        if (aKey) artistCount.set(aKey, n + 1)
        out.push(track)
        progressed = true
        break // one per batch per round → interleave
      }
    }
    round++
  }

  // If still short (strict caps), fill without per-artist limit
  if (out.length < limit) {
    for (const batch of results) {
      for (const track of batch) {
        if (seen.has(track.videoId)) continue
        seen.add(track.videoId)
        out.push(track)
        if (out.length >= limit) break
      }
      if (out.length >= limit) break
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
 * Prefers verified + high-subscriber channels; does not require exact
 * romanization match (e.g. "TUYU" → 「ツユ」).
 */
export async function fetchArtistChannel(artist: string): Promise<ArtistChannelInfo | null> {
  const q = artist.trim()
  if (!q) return null

  let items: any[] = []
  try {
    const data = await pipedFetch(`/search?q=${encodeURIComponent(q)}&filter=channels`)
    items = (data?.items || []).filter(
      (it: any) => it && (it.type === 'channel' || String(it.url || '').includes('/channel/'))
    )
  } catch {
    return null
  }
  if (!items.length) return null

  const artistNorm = normalizeArtistName(q)
  const artistTokens = q
    .toLowerCase()
    .split(/[\s/|,，、]+/)
    .map((s) => normalizeArtistName(s))
    .filter((s) => s.length >= 2)

  const scored = items.map((it: any, rank: number) => {
    const name = String(it.name || '')
    const nameNorm = normalizeArtistName(name)
    const subsRaw = Number(it.subscribers)
    const subs = Number.isFinite(subsRaw) && subsRaw > 0 ? subsRaw : 0
    let score = Math.log10(subs + 10) * 10 // 0–~80

    // Search rank — Piped already sorts by relevance
    score += Math.max(0, 30 - rank * 3)

    if (it.verified) score += 40

    // Name similarity (romanization / exact / partial)
    if (nameNorm && artistNorm) {
      if (nameNorm === artistNorm) score += 100
      else if (nameNorm.includes(artistNorm) || artistNorm.includes(nameNorm)) score += 50
      else if (artistTokens.some((tok) => nameNorm.includes(tok))) score += 35
    }

    // Topic channels are good for music catalogs
    if (/\btopic\b/i.test(name) && (nameNorm.includes(artistNorm) || artistNorm.length >= 3)) {
      score += 25
    }

    // Strongly penalize tiny random channels unless name is exact
    if (subs > 0 && subs < 1000 && nameNorm !== artistNorm) score -= 50
    if (subs > 0 && subs < 10000 && !it.verified && nameNorm !== artistNorm) score -= 15

    return { it, score, subs, name }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best || best.score < 5) return null

  // Reject clear garbage: very low score + low subs
  if (best.subs > 0 && best.subs < 500 && best.score < 40) {
    // try next candidate with real audience
    const better = scored.find((s) => s.subs >= 10000 || s.it.verified)
    if (better) {
      return hydrateChannel(better.it, better.name)
    }
  }

  return hydrateChannel(best.it, best.name)
}

async function hydrateChannel(best: any, fallbackName: string): Promise<ArtistChannelInfo | null> {
  const idMatch = /\/channel\/([^/?]+)/.exec(String(best.url || ''))
  const id = idMatch?.[1] || ''
  let bannerUrl = ''
  let avatarUrl = upgradeImageUrl(best.thumbnail, 'avatar')
  let description = String(best.description || '')
  let subscribers: number | null = Number(best.subscribers) > 0 ? Number(best.subscribers) : null
  let name = String(best.name || fallbackName)

  if (id) {
    try {
      const ch = await pipedFetch(`/channel/${id}`)
      if (ch) {
        name = ch.name || name
        description = ch.description || description
        avatarUrl = upgradeImageUrl(ch.avatarUrl, 'avatar') || avatarUrl
        bannerUrl = upgradeImageUrl(ch.bannerUrl, 'banner')
        if (typeof ch.subscriberCount === 'number' && ch.subscriberCount > 0) {
          subscribers = ch.subscriberCount
        } else if (typeof ch.subscribers === 'number' && ch.subscribers > 0) {
          subscribers = ch.subscribers
        }
      }
    } catch {
      /* avatar-only is fine */
    }
  }

  return { id, name, description, avatarUrl, bannerUrl, subscribers }
}

export async function searchArtistTracks(artist: string): Promise<Track[]> {
  const channel = await fetchArtistChannel(artist)
  const channelName = (channel?.name || artist).trim()
  const channelId = channel?.id || ''

  const nameNorm = normalizeArtistName(channelName)
  const artistNorm = normalizeArtistName(artist)
  const matched: Track[] = []
  const seen = new Set<string>()

  // Collect allowed uploader norms: channel name, query, and top uploaders from a raw search
  const allowed = new Set<string>()
  if (nameNorm) allowed.add(nameNorm)
  if (artistNorm) allowed.add(artistNorm)
  for (const tok of artist.split(/[\s/|,，、]+/)) {
    const n = normalizeArtistName(tok)
    if (n.length >= 2) allowed.add(n)
  }

  try {
    const probe = await pipedFetch(
      `/search?q=${encodeURIComponent(artist.trim())}&filter=videos`
    )
    const counts = new Map<string, number>()
    for (const item of probe?.items || []) {
      const u = normalizeArtistName(String(item.uploaderName || ''))
      if (!u) continue
      counts.set(u, (counts.get(u) || 0) + 1)
    }
    // Top recurring uploaders (≥2 hits) are likely the real artist
    for (const [u, n] of counts) {
      if (n >= 2) allowed.add(u)
    }
    // Single most common uploader always allowed
    let topU = ''
    let topN = 0
    for (const [u, n] of counts) {
      if (n > topN) {
        topN = n
        topU = u
      }
    }
    if (topU && topN >= 3) allowed.add(topU)
  } catch {
    /* optional */
  }

  const pushItem = (item: any, force = false) => {
    if (!item) return
    if (item.type === 'channel' || item.type === 'playlist') return
    const title = String(item.title || '')
    const duration = Number(item.duration) || 0
    if (item.isShort) return
    if (SHORTS_HASHTAG.test(title)) return
    if (duration > 0 && duration <= SHORTS_MAX_SECONDS) return

    const uploader = normalizeArtistName(String(item.uploaderName || item.uploader || ''))
    if (!force) {
      if (!uploader) return
      let ok = allowed.has(uploader)
      if (!ok) {
        for (const a of allowed) {
          if (a && (uploader.includes(a) || a.includes(uploader))) {
            ok = true
            break
          }
        }
      }
      if (!ok) return
    }

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
          item.thumbnailUrl ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      ),
    })
  }

  if (channelId) {
    try {
      const ch = await pipedFetch(`/channel/${channelId}`)
      for (const item of ch?.relatedStreams || []) {
        pushItem({ ...item, uploaderName: channelName }, true)
      }
    } catch {
      /* continue */
    }
  }

  try {
    const data = await pipedFetch(
      `/search?q=${encodeURIComponent(artist.trim())}&filter=videos`
    )
    for (const item of data?.items || []) pushItem(item)
  } catch {
    /* ignore */
  }

  if (matched.length < 5) {
    try {
      const data = await pipedFetch(
        `/search?q=${encodeURIComponent(channelName)}&filter=videos`
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
  if (channelNorm && (uploader.includes(channelNorm) || channelNorm.includes(uploader))) return true
  if (artistNorm && (uploader.includes(artistNorm) || artistNorm.includes(uploader))) return true
  return false
}

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

/** Albums / playlists associated with an artist. */
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

  albums.sort((a, b) => {
    const ao = normalizeArtistName(a.uploaderName) === nameNorm ? 0 : 1
    const bo = normalizeArtistName(b.uploaderName) === nameNorm ? 0 : 1
    return ao - bo
  })
  return albums.slice(0, 18)
}

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://vid.puffyan.us',
  'https://invidious.projectsegfau.lt',
]

/** Load tracks for a YouTube playlist / album. */
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
          thumbnail: String(data?.playlistThumbnail || data?.thumbnail || tracks[0]?.thumbnail || ''),
          uploaderName: String(data?.author || data?.uploader || ''),
          tracks,
        }
      }
    } catch {
      /* next */
    }
  }

  if (youtubeApiKey) {
    try {
      const tracks: Track[] = []
      const seen = new Set<string>()
      let pageToken = ''
      let metaName = 'Album'
      let metaThumb = ''
      let metaDesc = ''
      let metaChannel = ''

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
        thumbnail: String(item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
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
  } catch {
    /* ignore */
  }

  return empty
}
