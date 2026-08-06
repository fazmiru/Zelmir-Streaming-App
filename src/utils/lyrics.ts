export interface LyricLine {
  /** seconds */
  time: number
  text: string
}

export interface LyricsResult {
  lyrics: string | null
  /** timed lines when synced lyrics are available */
  lines?: LyricLine[]
  notFound?: boolean
  source?: string
}

function stripNoise(text: string): string {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/『|』|「|」|【|】/g, ' ')
    .replace(/official\s*(music\s*)?video/gi, ' ')
    .replace(/official\s*audio/gi, ' ')
    .replace(/lyric[s]?\s*video/gi, ' ')
    .replace(/\bmv\b/gi, ' ')
    .replace(/\blyrics?\b/gi, ' ')
    .replace(/歌ってみた/gi, ' ')
    .replace(/カバー/gi, ' ')
    .replace(/feat\.?.*/i, ' ')
    .replace(/ft\.?.*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse LRC: [mm:ss.xx] text */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  const re = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g
  for (const raw of lrc.split(/\r?\n/)) {
    let m: RegExpExecArray | null
    const row = raw.trim()
    if (!row) continue
    re.lastIndex = 0
    const texts: string[] = []
    let lastText = ''
    while ((m = re.exec(row)) !== null) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0
      const time = min * 60 + sec + frac
      lastText = (m[4] || '').trim()
      lines.push({ time, text: lastText })
      texts.push(lastText)
    }
    // bare text without timestamp — skip
  }
  lines.sort((a, b) => a.time - b.time)
  // drop empty metadata lines at start
  return lines.filter((l) => l.text.length > 0)
}

async function tryLrclib(artist: string, title: string): Promise<LyricsResult | null> {
  if (!title.trim()) return null
  try {
    const params = new URLSearchParams()
    if (artist.trim()) params.set('artist_name', artist.trim())
    params.set('track_name', title.trim())
    // lrclib get
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const data = await res.json()
      return fromLrclibPayload(data)
    }
  } catch {
    /* fall through */
  }

  // search fallback — better for JP titles / alternate romanization
  try {
    const q = [artist, title].filter(Boolean).join(' ').trim()
    const res = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) return null
    const list = await res.json()
    if (!Array.isArray(list) || list.length === 0) return null
    // Prefer entries with synced lyrics, then plain
    const ranked = [...list].sort((a, b) => {
      const sa = a.syncedLyrics ? 2 : a.plainLyrics ? 1 : 0
      const sb = b.syncedLyrics ? 2 : b.plainLyrics ? 1 : 0
      return sb - sa
    })
    return fromLrclibPayload(ranked[0])
  } catch {
    return null
  }
}

function fromLrclibPayload(data: any): LyricsResult | null {
  if (!data) return null
  const synced = typeof data.syncedLyrics === 'string' ? data.syncedLyrics.trim() : ''
  const plain = typeof data.plainLyrics === 'string' ? data.plainLyrics.trim() : ''
  if (synced) {
    const lines = parseLrc(synced)
    if (lines.length) {
      return {
        lyrics: lines.map((l) => l.text).join('\n'),
        lines,
        source: 'lrclib',
      }
    }
  }
  if (plain) {
    return { lyrics: plain.replace(/\r\n/g, '\n'), source: 'lrclib' }
  }
  return null
}

async function tryLyricsOvh(artist: string, title: string): Promise<string | null> {
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
 * Build lookup candidates — includes JP-friendly splits (「title」artist, Artist『title』).
 */
function buildCandidates(artist: string, rawTitle: string): Array<[string, string]> {
  const cleanTitle = stripNoise(rawTitle)
  const cleanArtist = stripNoise(artist)
  const candidates: Array<[string, string]> = []
  const seen = new Set<string>()

  const add = (a: string, t: string) => {
    const key = `${a}|||${t}`
    if (!t.trim() || seen.has(key)) return
    seen.add(key)
    candidates.push([a.trim(), t.trim()])
  }

  // Dash / JP dash splits
  const dashSplit = cleanTitle.split(/\s[-–—]\s/)
  if (dashSplit.length >= 2) {
    const left = dashSplit[0]
    const right = dashSplit.slice(1).join(' - ')
    add(cleanArtist || left, right)
    add(left, right)
    add(right, left)
  }

  // "Song / Artist" common in JP uploads
  const slash = cleanTitle.split(/\s\/\s/)
  if (slash.length === 2) {
    add(slash[1], slash[0])
    add(cleanArtist, slash[0])
  }

  add(cleanArtist, cleanTitle)
  // Title only search via lrclib search
  add('', cleanTitle)
  if (cleanArtist && cleanTitle.includes(cleanArtist)) {
    add(cleanArtist, cleanTitle.replace(cleanArtist, '').trim())
  }

  // Bilingual JP titles: "日本語 - English" or "日本語 / English"
  const jp = cleanTitle.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+[^\w]*/g)
  if (jp && jp.length) {
    const jpTitle = jp.join('').replace(/[\s\-–—\/]+$/g, '').trim()
    if (jpTitle.length >= 2) {
      add(cleanArtist, jpTitle)
      add('', jpTitle)
    }
  }
  const en = cleanTitle.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (en && en !== cleanTitle) {
    add(cleanArtist, en)
    add('', en)
  }

  return candidates
}

/**
 * Looks up lyrics (prefer synced LRC from lrclib for karaoke-style highlight).
 * Wider JP coverage via lrclib search + alternate title splits.
 */
/**
 * When only plain lyrics exist (common for JP tracks on some sources),
 * spread lines across the track duration so karaoke highlight still works.
 */
export function approximateTimedLines(lyrics: string, durationSec: number): LyricLine[] {
  const rows = lyrics
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\d+:\d+/.test(l))
  if (rows.length === 0) return []
  const dur = Number.isFinite(durationSec) && durationSec > 5 ? durationSec : Math.max(rows.length * 3.2, 30)
  // Small intro/outro padding so first line isn't active at 0:00
  const start = Math.min(4, dur * 0.06)
  const end = Math.max(start + 1, dur * 0.92)
  const span = end - start
  if (rows.length === 1) return [{ time: start, text: rows[0] }]
  return rows.map((text, i) => ({
    time: start + (span * i) / (rows.length - 1),
    text,
  }))
}

export async function fetchLyrics(artist: string, rawTitle: string): Promise<LyricsResult> {
  const candidates = buildCandidates(artist, rawTitle)

  for (const [a, t] of candidates) {
    const hit = await tryLrclib(a, t)
    if (hit?.lyrics || (hit?.lines && hit.lines.length)) return hit
  }

  for (const [a, t] of candidates) {
    if (!a) continue
    const plain = await tryLyricsOvh(a, t)
    if (plain) return { lyrics: plain, source: 'lyrics.ovh' }
  }

  return { lyrics: null, notFound: true }
}
