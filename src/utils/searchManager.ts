import type { Track } from '../types'
import { searchYouTube as performYouTubeSearch } from './youtube'

export interface SearchProvider {
  name: string
  search: (query: string) => Promise<Track[]>
}

/** Free iTunes Search Provider (Instant 30s previews without API keys) */
export const iTunesProvider: SearchProvider = {
  name: 'iTunes',
  search: async (query: string): Promise<Track[]> => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=20`
      )
      if (!res.ok) return []
      const data = await res.json()

      return (data.results || []).map((item: any) => ({
        id: `itunes-${item.trackId}`,
        title: item.trackName,
        artist: item.artistName,
        thumbnail: item.artworkUrl100?.replace('100x100bb', '300x300bb') ?? '',
        duration: Math.round(item.trackTimeMillis / 1000),
        sourceType: 'direct_url',
        streamUrl: item.previewUrl,
        externalUrl: item.trackViewUrl,
      }))
    } catch {
      return []
    }
  },
}

/** YouTube Search Provider */
export const YouTubeProvider: SearchProvider = {
  name: 'YouTube',
  search: async (query: string): Promise<Track[]> => {
    const res = await performYouTubeSearch(query)
    const items = res?.tracks ?? []
    return items.map((t: any) => ({
      id: `yt-${t.videoId}`,
      title: t.title,
      artist: t.artist,
      thumbnail: t.thumbnail,
      sourceType: 'youtube',
      youtubeVideoId: t.videoId,
    }))
  },
}

/** Executes multi-provider search simultaneously and aggregates results. */
export async function searchAllProviders(query: string): Promise<Track[]> {
  const results = await Promise.allSettled([
    iTunesProvider.search(query),
    YouTubeProvider.search(query),
  ])

  const tracks: Track[] = []
  for (const res of results) {
    if (res.status === 'fulfilled') {
      tracks.push(...res.value)
    }
  }

  return tracks
}