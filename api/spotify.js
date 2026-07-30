// api/spotify.js
//
// Vercel serverless function — runs server-side only, never shipped to the browser.
// Requires these two environment variables set in your Vercel project
// (Project Settings -> Environment Variables), WITHOUT a VITE_ prefix:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
// The VITE_ prefix is what tells Vite to bundle a variable into client-side code —
// these two must NOT have it, since exposing your Spotify client secret in the
// browser would let anyone extract and reuse it.
//
// Get these from https://developer.spotify.com/dashboard -> your app -> Settings.

export default async function handler(req, res) {
  const { id } = req.query

  if (!id) {
    res.status(400).json({ error: 'Missing playlist id.' })
    return
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: 'Spotify credentials are not configured on the server (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET).',
    })
    return
  }

  try {
    // 1. Get an access token via the Client Credentials flow.
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })

    if (!tokenResponse.ok) {
      res.status(502).json({ error: 'Could not authenticate with Spotify.' })
      return
    }

    const { access_token: accessToken } = await tokenResponse.json()

    // 2. Get the playlist's name.
    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${id}?fields=name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (playlistResponse.status === 404) {
      res.status(404).json({ error: 'Playlist not found. Make sure it is public and the link is correct.' })
      return
    }
    if (!playlistResponse.ok) {
      res.status(502).json({ error: 'Could not fetch playlist from Spotify.' })
      return
    }

    const playlistData = await playlistResponse.json()

    // 3. Get every track, following pagination (Spotify returns 100 per page).
    const tracks = []
    let nextUrl =
      `https://api.spotify.com/v1/playlists/${id}/tracks` +
      `?fields=items(track(name,artists(name))),next&limit=100`

    while (nextUrl) {
      const tracksResponse = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!tracksResponse.ok) break
      const page = await tracksResponse.json()

      for (const item of page.items ?? []) {
        const track = item.track
        if (!track) continue // local files / removed tracks come back null
        tracks.push({
          title: track.name,
          artist: (track.artists ?? []).map((a) => a.name).join(', '),
        })
      }

      nextUrl = page.next
    }

    res.status(200).json({ name: playlistData.name, tracks })
  } catch (err) {
    console.error('Spotify import failed:', err)
    res.status(500).json({ error: 'Unexpected error while importing the playlist.' })
  }
}
