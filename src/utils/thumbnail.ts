const YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/

export function thumbnailCandidates(thumbnail: string | undefined, videoId: string): string[] {
  const candidates = [
    thumbnail,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ].filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)))

  return [...new Set(candidates)]
}

export function thumbnailFallback(videoId: string): string {
  const id = YOUTUBE_ID.test(videoId) ? videoId : 'zelmir'
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
