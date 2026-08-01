export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    const raw = String(req.query?.url || '')
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

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: '*/*',
    }
    if (req.headers?.range) headers.Range = req.headers.range

    const upstream = await fetch(target.toString(), { headers, redirect: 'follow' })
    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status).json({ error: `Upstream ${upstream.status}` })
      return
    }

    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const cl = upstream.headers.get('content-length')
    if (cl) res.setHeader('Content-Length', cl)
    const ar = upstream.headers.get('accept-ranges')
    if (ar) res.setHeader('Accept-Ranges', ar)
    const cr = upstream.headers.get('content-range')
    if (cr) res.setHeader('Content-Range', cr)

    if (!upstream.body) {
      res.end()
      return
    }

    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
    res.end()
  } catch (err) {
    console.error('media-proxy error', err)
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy fetch failed', detail: String(err?.message || err) })
    } else {
      res.end()
    }
  }
}
