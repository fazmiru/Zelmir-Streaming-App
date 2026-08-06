/**
 * GET /api/piped-streams?v=VIDEO_ID
 *
 * Strategy (fastest / most-likely-to-work sources first):
 *   1. Piped instances  — raced concurrently, dynamic instance list + static fallback
 *   2. Invidious instances — raced concurrently, same pattern
 *   3. youtubei.js direct  — last resort, tightly time-boxed (cloud IPs get
 *      blocked by YouTube's bot detection often enough that this is the
 *      least reliable source, so it goes last and gets the smallest budget)
 *
 * Every stage has a hard timeout so the whole handler always resolves well
 * inside a typical serverless function limit, instead of quietly running
 * long past it (which is what was happening before — 8 sequential Piped
 * instances at up to 10s each is a worst case of 80s).
 */

// ---- tunables -------------------------------------------------------
const PER_REQUEST_TIMEOUT_MS = 4500 // timeout for a single instance's fetch
const PIPED_STAGE_BUDGET_MS = 5000 // overall budget for the whole Piped race
const INVIDIOUS_STAGE_BUDGET_MS = 4500
const YOUTUBEI_STAGE_BUDGET_MS = 5000
const INSTANCE_LIST_TIMEOUT_MS = 3000
const MAX_INSTANCES_PER_SOURCE = 10

const STATIC_PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.r4fo.com',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://piped-api.privacy.com.de',
]

const STATIC_INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://iv.ggtyler.dev',
]

// ---- generic helpers --------------------------------------------------

async function fetchJsonWithTimeout(url, ms = PER_REQUEST_TIMEOUT_MS) {
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

/**
 * Runs every task concurrently and resolves the moment ONE of them produces
 * a usable result (non-empty `streams`), or after `overallTimeoutMs` /
 * "everyone finished/failed" — whichever comes first. This is the key fix:
 * dead instances no longer cost you their full timeout one after another,
 * they just get silently outraced by whichever instance actually answers.
 */
function firstSuccessful(tasks, overallTimeoutMs) {
  return new Promise((resolve) => {
    if (tasks.length === 0) {
      resolve(null)
      return
    }
    let settled = false
    let remaining = tasks.length
    const finishOnce = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => finishOnce(null), overallTimeoutMs)

    tasks.forEach((task) => {
      task()
        .then((result) => {
          if (result && result.streams && result.streams.length) {
            finishOnce(result)
          } else {
            remaining -= 1
            if (remaining === 0) finishOnce(null)
          }
        })
        .catch(() => {
          remaining -= 1
          if (remaining === 0) finishOnce(null)
        })
    })
  })
}

// ---- Piped --------------------------------------------------------------

function collectFromPiped(data) {
  const streams = []
  for (const s of data.audioStreams || []) {
    if (s?.url) {
      streams.push({ url: s.url, mimeType: s.mimeType || 'audio/webm', bitrate: s.bitrate || 0, kind: 'audio' })
    }
  }
  for (const s of data.videoStreams || []) {
    if (s?.url && s.videoOnly === false) {
      streams.push({ url: s.url, mimeType: s.mimeType || 'video/mp4', bitrate: s.bitrate || 0, kind: 'progressive' })
    }
  }
  streams.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
    return (b.bitrate || 0) - (a.bitrate || 0)
  })
  return streams
}

/** Fetches the live Piped instance directory; falls back to the static list on any failure. */
async function getPipedInstances() {
  try {
    const data = await fetchJsonWithTimeout('https://piped-instances.kavin.rocks/', INSTANCE_LIST_TIMEOUT_MS)
    if (Array.isArray(data) && data.length) {
      const urls = data
        .map((entry) => {
          // Known shapes: [name, {api_url, up, ...}]  OR  {name, api_url, up, ...}
          if (Array.isArray(entry)) return entry[1]
          return entry
        })
        .filter((info) => info && info.up !== false && typeof info.api_url === 'string')
        .map((info) => info.api_url.replace(/\/+$/, ''))
      if (urls.length) {
        // De-dupe, cap fan-out, keep a couple of static ones as extra insurance
        const merged = [...new Set([...urls, ...STATIC_PIPED_INSTANCES])]
        return merged.slice(0, MAX_INSTANCES_PER_SOURCE)
      }
    }
  } catch {
    /* fall through to static list */
  }
  return STATIC_PIPED_INSTANCES.slice(0, MAX_INSTANCES_PER_SOURCE)
}

async function tryPipedOne(base, videoId) {
  const data = await fetchJsonWithTimeout(`${base}/streams/${videoId}`)
  if (!data) return null
  const streams = collectFromPiped(data)
  if (!streams.length) return null
  return { title: data.title || null, streams, source: base }
}

async function tryPiped(videoId) {
  const instances = await getPipedInstances()
  const tasks = instances.map((base) => () => tryPipedOne(base, videoId))
  return firstSuccessful(tasks, PIPED_STAGE_BUDGET_MS)
}

// ---- Invidious ------------------------------------------------------------

async function tryInvidiousOne(base, videoId) {
  const data = await fetchJsonWithTimeout(`${base}/api/v1/videos/${videoId}`)
  if (!data) return null
  const streams = []
  for (const f of data.adaptiveFormats || []) {
    const type = String(f.type || '')
    if (type.startsWith('audio/') && f.url) {
      streams.push({ url: f.url, mimeType: type.split(';')[0], bitrate: f.bitrate || 0, kind: 'audio' })
    }
  }
  for (const f of data.formatStreams || []) {
    if (f.url) {
      streams.push({ url: f.url, mimeType: String(f.type || 'video/mp4').split(';')[0], bitrate: f.bitrate || 0, kind: 'progressive' })
    }
  }
  if (!streams.length) return null
  return { title: data.title || null, streams, source: base }
}

async function tryInvidious(videoId) {
  const instances = STATIC_INVIDIOUS_INSTANCES.slice(0, MAX_INSTANCES_PER_SOURCE)
  const tasks = instances.map((base) => () => tryInvidiousOne(base, videoId))
  return firstSuccessful(tasks, INVIDIOUS_STAGE_BUDGET_MS)
}

// ---- youtubei.js (last resort, tightly bounded) ---------------------------

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

  const adaptive = info.streaming_data?.adaptive_formats || []
  for (const f of adaptive) {
    const mime = String(f.mime_type || f.mimeType || '')
    if (!mime.startsWith('audio/')) continue
    const url = await resolveFormatUrl(f, player)
    if (!url) continue
    streams.push({ url, mimeType: mime.split(';')[0] || 'audio/webm', bitrate: f.bitrate || 0, kind: 'audio' })
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
  const unique = streams.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
  unique.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'audio' ? -1 : 1
    return (b.bitrate || 0) - (a.bitrate || 0)
  })
  return unique
}

/** Races a promise against a timeout. The underlying promise, if it loses, is abandoned (not cancelled) — fine here since we only care about not blocking the response. */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

async function tryYoutubei(videoId, budgetMs) {
  const deadline = Date.now() + budgetMs
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
  // Only two client variants — trying eight sequentially with no timeout
  // was the main reason this stage could stall the whole function.
  const clients = [undefined, 'ANDROID']

  try {
    const yt = await withTimeout(
      Innertube.create({ retrieve_player: true, generate_session_locally: true }),
      Math.max(500, deadline - Date.now())
    )
    if (!yt) return { error: 'youtubei.js: Innertube.create timed out' }

    for (const client of clients) {
      if (Date.now() >= deadline) {
        notes.push('budget exhausted')
        break
      }
      try {
        const info = await withTimeout(
          client ? yt.getBasicInfo(videoId, client) : yt.getBasicInfo(videoId),
          Math.max(500, deadline - Date.now())
        )
        if (!info) {
          notes.push(`basic/${client || 'default'}: timed out`)
          continue
        }
        const streams = await formatsFromInfo(info, yt)
        if (streams.length) {
          return { title: info.basic_info?.title || null, streams, source: `youtubei.js/basic/${client || 'default'}` }
        }
        notes.push(`basic/${client || 'default'}: no streams`)
      } catch (e) {
        notes.push(`basic/${client || 'default'}: ${e.message}`)
      }
    }

    return { error: `youtubei.js: no formats (${notes.join('; ')})` }
  } catch (err) {
    return { error: `youtubei.js runtime: ${err.message}` }
  }
}

// ---- handler ---------------------------------------------------------

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

    // Stage 1 + 2 run concurrently with each other (not just internally) —
    // no reason to wait for all of Piped to finish before starting Invidious.
    const [piped, invidious] = await Promise.all([tryPiped(videoId), tryInvidious(videoId)])

    if (piped?.streams?.length) {
      res.status(200).json({ videoId, title: piped.title, source: piped.source, urls: piped.streams.map((s) => s.url), streams: piped.streams })
      return
    }
    diagnostics.push('piped: no streams')

    if (invidious?.streams?.length) {
      res.status(200).json({ videoId, title: invidious.title, source: invidious.source, urls: invidious.streams.map((s) => s.url), streams: invidious.streams })
      return
    }
    diagnostics.push('invidious: no streams')

    // Stage 3 — last resort, tightly bounded.
    const yt = await tryYoutubei(videoId, YOUTUBEI_STAGE_BUDGET_MS)
    if (yt?.streams?.length) {
      res.status(200).json({ videoId, title: yt.title, source: yt.source, urls: yt.streams.map((s) => s.url), streams: yt.streams })
      return
    }
    if (yt?.error) diagnostics.push(yt.error)

    res.status(404).json({
      error: 'No playable streams found for this track. Try again later.',
      videoId,
      diagnostics,
    })
  } catch (err) {
    console.error('piped-streams error', err)
    res.status(500).json({ error: 'Stream lookup failed', detail: String(err?.message || err) })
  }
}