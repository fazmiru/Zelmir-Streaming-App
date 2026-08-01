/**
 * GET /api/piped-streams?v=VIDEO_ID
 */

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

async function resolveFormatUrl(format, player) {
  if (!format) return null
  if (format.url) return format.url
  if (typeof format.decipher === 'function' && player) {
    try {
      return await format.decipher(player)
    } catch {
      return null
    }
  }
  // Some versions expose download URL via toURL / getDecipheredUrl
  if (typeof format.toURL === 'function') {
    try {
      return await format.toURL()
    } catch {
      return null
    }
  }
  return null
}

async function formatsFromInfo(info, yt) {
  const streams = []
  const player = yt?.session?.player

  // chooseFormat helpers
  for (const opts of [
    { type: 'audio', quality: 'best' },
    { type: 'audio', quality: 'bestefficiency' },
    { format: 'mp4', type: 'audio' },
  ]) {
    try {
      const best = info.chooseFormat?.(opts)
      const url = await resolveFormatUrl(best, player)
      if (url) {
        streams.push({
          url,
          mimeType: String(best.mime_type || 'audio/webm').split(';')[0],
          bitrate: best.bitrate || 0,
          kind: 'audio',
        })
      }
    } catch {
      /* ignore */
    }
  }

  const adaptive = info.streaming_data?.adaptive_formats || []
  for (const f of adaptive) {
    const mime = String(f.mime_type || f.mimeType || '')
    const hasAudio =
      mime.startsWith('audio/') ||
      f.has_audio === true ||
      (f.audio_quality && !f.quality_label)
    if (!hasAudio && mime.startsWith('video/')) continue
    if (!mime.startsWith('audio/') && !hasAudio) continue
    const url = await resolveFormatUrl(f, player)
    if (!url) continue
    streams.push({
      url,
      mimeType: mime.split(';')[0] || 'audio/webm',
      bitrate: f.bitrate || 0,
      kind: 'audio',
    })
  }

  const progressive = info.streaming_data?.formats || []
  for (const f of progressive) {
    const url = await resolveFormatUrl(f, player)
    if (!url) continue
    streams.push({
      url,
      mimeType: String(f.mime_type || f.mimeType || 'video/mp4').split(';')[0],
      bitrate: f.bitrate || 0,
      kind: 'progressive',
    })
  }

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
  return unique
}

async function tryYoutubei(videoId) {
  let Innertube
  try {
    const mod = await import('youtubei.js')
    Innertube = mod.Innertube || mod.default?.Innertube || mod.default
    if (typeof Innertube?.create !== 'function') {
      return { error: 'youtubei.js: Innertube.create missing' }
    }
  } catch (e) {
    return { error: `youtubei.js import: ${e.message}` }
  }

  const notes = []

  // Multiple client / method combos — YouTube often blocks default WEB client
  const clients = [
    undefined, // default
    'ANDROID',
    'ANDROID_MUSIC',
    'IOS',
    'TV',
    'TV_EMBEDDED',
    'MWEB',
    'WEB_EMBEDDED',
  ]

  try {
    const yt = await Innertube.create({
      retrieve_player: true,
      generate_session_locally: true,
    })

    // getInfo first (fuller than getBasicInfo)
    try {
      const info = await yt.getInfo(videoId)
      const playability = info.playability_status?.status || info.playability_status
      notes.push(`getInfo status=${playability}`)
      const streams = await formatsFromInfo(info, yt)
      if (streams.length) {
        return {
          title: info.basic_info?.title || info.video_details?.title || null,
          streams,
          source: 'youtubei.js/getInfo',
        }
      }
    } catch (e) {
      notes.push(`getInfo: ${e.message}`)
    }

    for (const client of clients) {
      try {
        const info = client
          ? await yt.getBasicInfo(videoId, client)
          : await yt.getBasicInfo(videoId)
        const playability =
          info.playability_status?.status ||
          info.playability_status ||
          (info.streaming_data ? 'OK' : 'NO_STREAMS')
        notes.push(`basic/${client || 'default'} status=${playability} sd=${!!info.streaming_data}`)
        const streams = await formatsFromInfo(info, yt)
        if (streams.length) {
          return {
            title: info.basic_info?.title || null,
            streams,
            source: `youtubei.js/basic/${client || 'default'}`,
          }
        }
      } catch (e) {
        notes.push(`basic/${client || 'default'}: ${e.message}`)
      }
    }

    // download helper as last resort
    try {
      const stream = await yt.download(videoId, { type: 'audio', quality: 'best' })
      if (stream) {
        // ReadableStream — not a URL; skip for URL-based proxy
        notes.push('download(): got stream object (not URL)')
      }
    } catch (e) {
      notes.push(`download: ${e.message}`)
    }

    return { error: `youtubei.js: no formats (${notes.join('; ')})` }
  } catch (err) {
    return { error: `youtubei.js runtime: ${err.message}` }
  }
}

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
