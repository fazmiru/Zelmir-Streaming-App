// api/spotify.ts

export default async function handler(req: any, res: any) {
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

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Spotify API credentials missing in Vercel Environment Variables.' })
  }

  try {
    // 1. Get an official access token using Client Credentials
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authString}`,
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenRes.ok) {
      throw new Error('Failed to authenticate with official Spotify API')
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    // 2. Fetch the playlist using the official token
    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!playlistRes.ok) {
      if (playlistRes.status === 404) {
        return res.status(404).json({ error: 'Playlist not found. Verify the URL/ID.' })
      }
      return res.status(400).json({ error: 'Could not fetch playlist. Ensure it is public.' })
    }

    const playlistData = await playlistRes.json()

    // 3. Extract tracks
    const tracks = (playlistData.tracks?.items || [])
      .filter((item: any) => item.track)
      .map((item: any) => ({
        title: item.track.name || 'Unknown Track',
        artist: item.track.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist',
      }))

    if (tracks.length === 0) {
      return res.status(400).json({ error: 'No playable tracks found in this playlist.' })
    }

    return res.status(200).json({
      name: playlistData.name || 'Imported Spotify Playlist',
      tracks,
    })
  } catch (err: any) {
    console.error('Spotify API Error:', err)
    return res.status(500).json({ error: err.message || 'Internal Server Error' })
  }
}
