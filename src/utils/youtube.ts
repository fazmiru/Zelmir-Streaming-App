import type { Track, YouTubeSearchItem } from '../types'

export function toTrack(item: YouTubeSearchItem): Track {
  return {
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium.url,
  }
}

/** Parses a YouTube API ISO-8601 duration like "PT3M42S" into seconds. */
export function parseIsoDuration(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return 0
  const hours = parseInt(match[1] ?? '0', 10)
  const minutes = parseInt(match[2] ?? '0', 10)
  const seconds = parseInt(match[3] ?? '0', 10)
  return hours * 3600 + minutes * 60 + seconds
}

const SHORTS_HASHTAG = /#shorts?\b/i
// Anything at or under this length is almost always a Short rather than a full song.
const SHORTS_MAX_SECONDS = 60

/**
 * Fetches durations for a batch of search results and filters out anything that
 * looks like a YouTube Short (very short duration, or "#shorts" in the title).
 */
export async function filterOutShorts(items: YouTubeSearchItem[], apiKey: string): Promise<YouTubeSearchItem[]> {
  const ids = items.map((i) => i.id.videoId).filter(Boolean)
  if (ids.length === 0) return items

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids.join(',')}&key=${apiKey}`
    )
    if (!response.ok) return items
    const data = await response.json()
    const durationById = new Map<string, number>()
    for (const video of data.items ?? []) {
      durationById.set(video.id, parseIsoDuration(video.contentDetails?.duration ?? 'PT0S'))
    }

    return items.filter((item) => {
      if (SHORTS_HASHTAG.test(item.snippet.title)) return false
      const seconds = durationById.get(item.id.videoId)
      if (seconds === undefined) return true
      return seconds > SHORTS_MAX_SECONDS
    })
  } catch {
    return items
  }
}

/** Performs a YouTube search and returns formatted tracks */
export async function searchYouTube(query: string): Promise<{ tracks: Track[] }> {
  const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY as string
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&key=${apiKey}`
  )
  if (!res.ok) return { tracks: [] }
  const data = await res.json()
  
  const items: YouTubeSearchItem[] = data.items || []
  const filtered = await filterOutShorts(items, apiKey)
  
  return {
    tracks: filtered.map(toTrack),
  }
}