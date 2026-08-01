/**
 * Vercel serverless: resolve playable media URLs for a YouTube videoId.
 * Tries multiple Piped instances server-side (avoids browser CORS / dead instances).
 *
 * GET /api/piped-streams?v=VIDEO_ID
 * → { videoId, title, urls: string[], streams: { url, mimeType, bitrate, kind }[] }
 */

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.darkness.services',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.r4fo.com',
]

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com',
]

function collectFromPiped(data) {
  const streams = []
  for (const s of data.audioStreams || []) {
    if (s?.url) {
      streams.push({
        url: s.url,
        mimeType: s.mimeType || 'audio/webm',
        bitrate: s.bitrate || 0,
        kind: 'audio',
      })
    }
  }
  // Progressive muxed video (includes audio) — Piped often returns these when audioStreams is empty
  for (const s of data.videoStreams || []) {
    if (s?.url && s.videoOnly === false) {
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

async function tryPiped(videoId) {
  for (const base of PIPED_INSTANCES) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 9000)
    try {
      const res = await fetch(`${base}/streams/${videoId}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Zelmir/1.0', Accept: 'application/json' },
      })
      if (!res.ok) continue
      const data = await res.json()
      const streams = collectFromPiped(data)
      if (streams.length) {
        return { title: data.title || null, streams, source: base }
      }
    } catch {
      // next instance
    } finally {
      clearTimeout(t)
    }
  }
  return null
}

async function tryInvidious(videoId) {
  for (const base of INVIDIOUS) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 9000)
    try {
      const res = await fetch(`${base}/api/v1/videos/${videoId}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Zelmir/1.0', Accept: 'application/json' },
      })
      if (!res.ok) continue
      const data = await res.json()
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
    } catch {
      // next
    } finally {
      clearTimeout(t)
    }
  }
  return null
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const videoId = String(req.query.v || '').trim()
  if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
    res.status(400).json({ error: 'Invalid video id' })
    return
  }

  try {
    const result = (await tryPiped(videoId)) || (await tryInvidious(videoId))
    if (!result || !result.streams.length) {
      res.status(404).json({
        error: 'No playable streams found for this track. Try again later.',
        videoId,
      })
      return
    }

    res.status(200).json({
      videoId,
      title: result.title,
      source: result.source,
      urls: result.streams.map((s) => s.url),
      streams: result.streams,
    })
  } catch (err) {
    console.error('piped-streams error', err)
    res.status(500).json({ error: 'Stream lookup failed' })
  }
}
