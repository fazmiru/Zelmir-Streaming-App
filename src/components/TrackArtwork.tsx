import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react'
import { thumbnailCandidates } from '../utils/thumbnail'

interface TrackArtworkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  src?: string
  videoId: string
}

export function TrackArtwork({ src, videoId, alt = '', ...props }: TrackArtworkProps) {
  const candidates = useMemo(() => thumbnailCandidates(src, videoId), [src, videoId])
  const [candidateIndex, setCandidateIndex] = useState(0)

  useEffect(() => {
    setCandidateIndex(0)
  }, [src, videoId])

  const currentSrc = candidates[candidateIndex]
  if (!currentSrc) {
    return <div className={`${props.className || ''} track-art-placeholder`} aria-label={alt} />
  }

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      onError={() => setCandidateIndex((index) => Math.min(index + 1, candidates.length))}
    />
  )
}
