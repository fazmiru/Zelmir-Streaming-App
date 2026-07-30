// api/spotify.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS headers so your app can call this endpoint
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Playlist ID is required' })
  }

  try {
    // Fetch directly from spotifydown on the server side (bypasses CORS & bot filters)
    const response = await fetch(`https://api.spotifydown.com/metadata/playlist/${id}`)
    
    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to fetch playlist metadata' })
    }

    const data = await response.json()

    if (!data.success || !data.trackList || data.trackList.length === 0) {
      return res.status(404).json({ error: 'No playable tracks found in playlist' })
    }

    const tracks = data.trackList.map((t: any) => ({
      title: t.title || t.name || 'Unknown Track',
      artist: t.artists || t.artist || 'Unknown Artist',
    }))

    return res.status(200).json({
      name: data.title || 'Imported Spotify Playlist',
      tracks,
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}