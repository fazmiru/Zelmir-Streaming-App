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

function collectFromPiped(data) {
  const streams = []
  for (const s of data.audioStreams || []) {
    if (s && s.url) streams.push({ url: s.url, mimeType: s.mimeType || 'audio/webm', bitrate: s.bitrate || 0, kind: 'audio' })
  }
  for (const s of data.videoStreams || []) {
    if (s && s.url && s.videoOnly === false) streams.push({ url: s.url, mimeType: s.mimeType || 'video/mp4', bitrate: s.bitrate || 0, kind: 'progressive' })
  }
  streams.sort((a, b) => (a.kind === b.kind ? (b.bitrate || 0) - (a.bitrate || 0) : a.kind === 'audio' ? -1 : 1))
  return streams
}

async function tryFetchJson(url, ms = 9000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Zelmir/1.0', Accept: 'application/json' } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'OPTIONS') return res.status(204).end()
    const videoId = String((req.query && req.query.v) || '').trim()
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return res.status(400).json({ error: 'Invalid video id' })

    let result = null
    for (const base of PIPED_INSTANCES) {
      const data = await tryFetchJson(base + '/streams/' + videoId)
      if (!data) continue
      const streams = collectFromPiped(data)
      if (streams.length) {
        result = { title: data.title || null, streams, source: base }
        break
      }
    }
    if (!result) return res.status(404).json({ error: 'No playable streams found for this track. Try again later.', videoId })
    return res.status(200).json({
      videoId,
      title: result.title,
      source: result.source,
      urls: result.streams.map((s) => s.url),
      streams: result.streams,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Stream lookup failed', detail: String(err && err.message) })
  }
}
