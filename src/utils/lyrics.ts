export interface LyricsResult {
  lyrics: string | null
  /** true if we found nothing anywhere and the caller should offer a "search online" fallback */
  notFound?: boolean
}

/**
 * YouTube video titles are messy ("Artist - Song (Official MV)", "『Song』Artist", etc).
 * Strip the noise so the lyrics lookup has a decent chance of matching.
 */
function stripNoise(text: string): string {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/『|』|「|」/g, ' ')
    .replace(/official\s*(music\s*)?video/gi, ' ')
    .replace(/official\s*audio/gi, ' ')
    .replace(/lyric[s]?\s*video/gi, ' ')
    .replace(/\bmv\b/gi, ' ')
    .replace(/\blyrics?\b/gi, ' ')
    .replace(/feat\.?.*/i, ' ')
    .replace(/ft\.?.*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function tryFetch(artist: string, title: string): Promise<string | null> {
  if (!artist.trim() || !title.trim()) return null
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data.lyrics === 'string' && data.lyrics.trim()) {
      return data.lyrics.trim().replace(/\r\n/g, '\n')
    }
    return null
  } catch {
    return null
  }
}

/**
 * Looks up lyrics for a track. YouTube gives us a channel name (often the artist)
 * and a video title (often "Artist - Song"), so we try a few combinations before
 * giving up.
 */
export async function fetchLyrics(artist: string, rawTitle: string): Promise<LyricsResult> {
  const cleanTitle = stripNoise(rawTitle)
  const cleanArtist = stripNoise(artist)

  const candidates: Array<[string, string]> = []

  // "Artist - Song" or "Song - Artist" inside the title itself.
  const dashSplit = cleanTitle.split(/\s[-–—]\s/)
  if (dashSplit.length >= 2) {
    const [a, b] = dashSplit
    candidates.push([cleanArtist || a, b])
    candidates.push([a, b])
    candidates.push([b, a])
  }

  candidates.push([cleanArtist, cleanTitle])

  for (const [a, t] of candidates) {
    const lyrics = await tryFetch(a, t)
    if (lyrics) return { lyrics }
  }

  return { lyrics: null, notFound: true }
}
