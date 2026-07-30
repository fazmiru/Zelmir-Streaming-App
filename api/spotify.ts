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

  try {
    // 1. Get an anonymous web access token from Spotify's public Web Player endpoint
    const tokenRes = await fetch(
      'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      }
    )

    if (!tokenRes.ok) {
      throw new Error('Failed to obtain guest session token from Spotify')
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.accessToken

    if (!accessToken) {
      throw new Error('No access token returned from Spotify')
    }

    // 2. Fetch the playlist details directly from official Spotify Web API using guest token
    const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    })

    if (!playlistRes.ok) {
      if (playlistRes.status === 404) {
        return res.status(404).json({ error: 'Playlist not found. Verify the URL/ID.' })
      }
      return res.status(400).json({ error: 'Could not fetch playlist. Ensure it is public.' })
    }

    const playlistData = await playlistRes.json()

    // 3. Extract track titles and artists
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
