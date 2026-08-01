/**
 * GET /api/piped-streams?v=VIDEO_ID
 * ESM handler — works with youtubei.js (ESM package).
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

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
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Zelmir/1.0)',
        Accept: 'application/json',
      },
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
    if (s?.url) {
      streams.push({
        url: s.url,
        mimeType: s.mimeType || 'audio/webm',
        bitrate: s.bitrate || 0,
        kind: 'audio',
      })
    }
  }
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

async function loadInnertube() {
  // Try several import styles — Vercel + youtubei.js version differences
  const attempts = []

  // 1) Native ESM
  try {
    const mod = await import('youtubei.js')
    const Innertube = mod.Innertube || mod.default?.Innertube || mod.default
    if (typeof Innertube?.create === 'function') {
      return { Innertube, via: 'esm-import' }
    }
    attempts.push('esm-import: no Innertube.create')
  } catch (e) {
    attempts.push(`esm-import: ${e.message}`)
  }

  // 2) createRequire (CJS interop)
  try {
    const mod = require('youtubei.js')
    const Innertube = mod.Innertube || mod.default?.Innertube || mod.default
    if (typeof Innertube?.create === 'function') {
      return { Innertube, via: 'require' }
    }
    attempts.push('require: no Innertube.create')
  } catch (e) {
    attempts.push(`require: ${e.message}`)
  }

  // 3) Deep path used by some builds
  try {
    const mod = await import('youtubei.js/dist/src/platform/node.js')
    attempts.push(`node-platform: keys=${Object.keys(mod).join(',')}`)
  } catch (e) {
    attempts.push(`node-platform: ${e.message}`)
  }

  return { error: attempts.join(' | ') }
}

async function tryYoutubei(videoId) {
  const loaded = await loadInnertube()
  if (loaded.error) {
    return { error: `youtubei.js load failed: ${loaded.error}` }
  }

  try {
    const { Innertube, via } = loaded
    const yt = await Innertube.create({ retrieve_player: true })
    const info = await yt.getBasicInfo(videoId)

    const streams = []

    // Helper path
    try {
      const best = info.chooseFormat({ type: 'audio', quality: 'best' })
      if (best) {
        let url = best.url
        if (!url && typeof best.decipher === 'function') {
          url = await best.decipher(yt.session.player)
        }
        if (url) {
          streams.push({
            url,
            mimeType: String(best.mime_type || 'audio/webm').split(';')[0],
            bitrate: best.bitrate || 0,
            kind: 'audio',
          })
        }
      }
    } catch {
      /* ignore */
    }

    const adaptive = info.streaming_data?.adaptive_formats || []
    for (const f of adaptive) {
      const mime = String(f.mime_type || '')
      if (!mime.startsWith('audio/')) continue
      let url = f.url
      if (!url && typeof f.decipher === 'function') {
        try {
          url = await f.decipher(yt.session.player)
        } catch {
          continue
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

    const progressive = info.streaming_data?.formats || []
    for (const f of progressive) {
      let url = f.url
      if (!url && typeof f.decipher === 'function') {
        try {
          url = await f.decipher(yt.session.player)
        } catch {
          continue
        }
      }
      if (!url) continue
      streams.push({
        url,
        mimeType: String(f.mime_type || 'video/mp4').split(';')[0],
        bitrate: f.bitrate || 0,
        kind: 'progressive',
      })
    }

    // Dedupe
    const seen = new Set()
    const unique = []
    for (const s of streams) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      unique.push(s)
    }
    unique.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
      return (b.bitrate || 0) - (a.bitrate || 0)
    })

    if (!unique.length) {
      return {
        error: `youtubei.js (${via}): no formats (streaming_data=${!!info.streaming_data})`,
      }
    }

    return {
      title: info.basic_info?.title || null,
      streams: unique,
      source: `youtubei.js/${via}`,
    }
  } catch (err) {
    return { error: `youtubei.js runtime: ${err.message || String(err)}` }
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
    if (streams.length) {
      return { title: data.title || null, streams, source: base }
    }
  }
  return null
}

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    const videoId = String(req.query?.v || '').trim()
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) {
      res.status(400).json({ error: 'Invalid video id' })
      return
    }

    const diagnostics = []

    const yt = await tryYoutubei(videoId)
    if (yt?.streams?.length) {
      res.status(200).json({
        videoId,
        title: yt.title,
        source: yt.source,
        urls: yt.streams.map((s) => s.url),
        streams: yt.streams,
      })
      return
    }
    if (yt?.error) diagnostics.push(yt.error)

    const piped = await tryPiped(videoId)
    if (piped?.streams?.length) {
      res.status(200).json({
        videoId,
        title: piped.title,
        source: piped.source,
        urls: piped.streams.map((s) => s.url),
        streams: piped.streams,
      })
      return
    }
    diagnostics.push('piped: no streams')

    const inv = await tryInvidious(videoId)
    if (inv?.streams?.length) {
      res.status(200).json({
        videoId,
        title: inv.title,
        source: inv.source,
        urls: inv.streams.map((s) => s.url),
        streams: inv.streams,
      })
      return
    }
    diagnostics.push('invidious: no streams')

    res.status(404).json({
      error: 'No playable streams found for this track. Try again later.',
      videoId,
      diagnostics,
    })
  } catch (err) {
    console.error('piped-streams error', err)
    res.status(500).json({
      error: 'Stream lookup failed',
      detail: String(err?.message || err),
    })
  }
}
