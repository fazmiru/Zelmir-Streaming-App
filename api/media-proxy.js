/**
 * Vercel serverless: proxy a media URL so the browser can download it (CORS-safe).
 * Streams the body (does not buffer the whole file in memory).
 *
 * GET /api/media-proxy?url=ENCODED_URL
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const raw = String(req.query.url || '')
  let target
  try {
    target = new URL(raw)
  } catch {
    res.status(400).json({ error: 'Invalid url' })
    return
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    res.status(400).json({ error: 'Unsupported protocol' })
    return
  }

  try {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    }
    if (req.headers.range) {
      headers.Range = req.headers.range
    }

    const upstream = await fetch(target.toString(), { headers, redirect: 'follow' })
    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
      return
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const contentLength = upstream.headers.get('content-length')
    const acceptRanges = upstream.headers.get('accept-ranges')
    const contentRange = upstream.headers.get('content-range')

    res.status(upstream.status)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    if (contentLength) res.setHeader('Content-Length', contentLength)
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges)
    if (contentRange) res.setHeader('Content-Range', contentRange)

    if (!upstream.body) {
      res.end()
      return
    }

    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
    res.end()
  } catch (err) {
    console.error('media-proxy error', err)
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy fetch failed' })
    } else {
      res.end()
    }
  }
}
