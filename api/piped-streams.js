/**
 * GET /api/piped-streams?v=VIDEO_ID
 * Resolves downloadable media URLs.
 * Priority: youtubei.js (reliable) → Piped → Invidious
 *
 * Requires: npm install youtubei.js  (in the project root)
 */

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
  'https://api.piped.projectsegfau.lt',
]

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://iv.ggtyler.dev',
]

async function tryFetchJson(url, ms = 10000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Zelmir/1.0)', Accept: 'application/json' },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

function collectFromPiped(data) {
  const streams = []
  for (const s of data.audioStreams || []) {
    if (s && s.url) {
      streams.push({
        url: s.url,
        mimeType: s.mimeType || 'audio/webm',
        bitrate: s.bitrate || 0,
        kind: 'audio',
      })
    }
  }
  for (const s of data.videoStreams || []) {
    if (s && s.url && s.videoOnly === false) {
      streams.push({
        url: s.url,
        mimeType: s.mimeType || 'video/mp4',
        bitrate: s.bitrate || 0,
        kind: 'progressive',
      })
    }
  }
  streams.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
    return (b.bitrate || 0) - (a.bitrate || 0)
  })
  return streams
}

/** Primary: YouTube.js innertube client (needs youtubei.js installed). */
async function tryYoutubei(videoId) {
  try {
    // Dynamic import so the function still loads if the package is missing
    const mod = await import('youtubei.js')
    const Innertube = mod.Innertube || (mod.default && mod.default.Innertube)
    if (!Innertube) return null

    const yt = await Innertube.create({
      retrieve_player: true,
    })
    const info = await yt.getBasicInfo(videoId)
    const adaptive = (info.streaming_data && info.streaming_data.adaptive_formats) || []
    const progressive = (info.streaming_data && info.streaming_data.formats) || []

    const streams = []
    for (const f of adaptive) {
      const mime = String(f.mime_type || '')
      if (!mime.startsWith('audio/')) continue
      // deciphered URL when available
      let url = f.url || null
      if (!url && typeof f.decipher === 'function') {
        try {
          url = await f.decipher(yt.session.player)
        } catch {
          /* ignore */
        }
      }
      if (!url) continue
      streams.push({
        url,
        mimeType: mime.split(';')[0],
        bitrate: f.bitrate || 0,
        kind: 'audio',
      })
    }
    for (const f of progressive) {
      const mime = String(f.mime_type || 'video/mp4')
      let url = f.url || null
      if (!url && typeof f.decipher === 'function') {
        try {
          url = await f.decipher(yt.session.player)
        } catch {
          /* ignore */
        }
      }
      if (!url) continue
      streams.push({
        url,
        mimeType: mime.split(';')[0],
        bitrate: f.bitrate || 0,
        kind: 'progressive',
      })
    }

    // Prefer choosing via helper if available
    try {
      const bestAudio = info.chooseFormat({ type: 'audio', quality: 'best' })
      if (bestAudio) {
        let url = bestAudio.url
        if (!url && typeof bestAudio.decipher === 'function') {
          url = await bestAudio.decipher(yt.session.player)
        }
        if (url) {
          streams.unshift({
            url,
            mimeType: String(bestAudio.mime_type || 'audio/webm').split(';')[0],
            bitrate: bestAudio.bitrate || 0,
            kind: 'audio',
          })
        }
      }
    } catch {
      /* ignore */
    }

    streams.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
      return (b.bitrate || 0) - (a.bitrate || 0)
    })

    // Dedupe by url
    const seen = new Set()
    const unique = []
    for (const s of streams) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      unique.push(s)
    }

    if (!unique.length) return null
    return {
      title: (info.basic_info && info.basic_info.title) || null,
      streams: unique,
      source: 'youtubei.js',
    }
  } catch (err) {
    console.error('youtubei.js failed:', err && err.message ? err.message : err)
    return null
  }
}

async function tryPiped(videoId) {
  for (const base of PIPED_INSTANCES) {
    const data = await tryFetchJson(`${base}/streams/${videoId}`)
    if (!data) continue
    const streams = collectFromPiped(data)
    if (streams.length) {
      return { title: data.title || null, streams, source: base }
    }
  }
  return null
}

async function tryInvidious(videoId) {
  for (const base of INVIDIOUS) {
    const data = await tryFetchJson(`${base}/api/v1/videos/${videoId}`)
    if (!data) continue
    const streams = []
    for (const f of data.adaptiveFormats || []) {
      const type = String(f.type || '')
      if (type.startsWith('audio/') && f.url) {
        streams.push({
          url: f.url,
          mimeType: type.split(';')[0],
          bitrate: f.bitrate || 0,
          kind: 'audio',
        })
      }
    }
    for (const f of data.formatStreams || []) {
      if (f.url) {
        streams.push({
          url: f.url,
          mimeType: String(f.type || 'video/mp4').split(';')[0],
          bitrate: f.bitrate || 0,
          kind: 'progressive',
        })
      }
    }
    streams.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
      return (b.bitrate || 0) - (a.bitrate || 0)
    })
    if (streams.length) {
      return { title: data.title || null, streams, source: base }
    }
  }
  return null
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') return res.status(204).end()

    const videoId = String((req.query && req.query.v) || '').trim()
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video id' })
    }

    // youtubei first (works for real YT tracks), then Piped/Invidious fallbacks
    const result =
      (await tryYoutubei(videoId)) ||
      (await tryPiped(videoId)) ||
      (await tryInvidious(videoId))

    if (!result || !result.streams.length) {
      return res.status(404).json({
        error: 'No playable streams found for this track. Try again later.',
        videoId,
        hint: 'Install youtubei.js in the project root: npm install youtubei.js',
      })
    }

    return res.status(200).json({
      videoId,
      title: result.title,
      source: result.source,
      urls: result.streams.map((s) => s.url),
      streams: result.streams,
    })
  } catch (err) {
    console.error('piped-streams error', err)
    return res.status(500).json({
      error: 'Stream lookup failed',
      detail: String(err && err.message),
    })
  }
}
