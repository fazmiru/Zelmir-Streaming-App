import { useState, useRef, useEffect, useCallback } from 'react'
import type { Track } from '../types'
import { useOffline } from '../offline/OfflineContext'
import './TrackOptionsMenu.css'

interface TrackOptionsMenuProps {
  track?: Track
  onPlayNext?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onStartMix?: (track: Track) => void
  onSaveToLibrary?: (track: Track) => void
  onSaveToPlaylist?: (track: Track) => void
  onRemoveFromPlaylist?: (track: Track) => void
  onGoToAlbum?: (albumName: string) => void
  onGoToArtist?: (artistName: string) => void
  isInPlaylist?: boolean
  isLiked?: boolean
}

export function TrackOptionsMenu({
  track,
  onPlayNext,
  onAddToQueue,
  onStartMix,
  onSaveToLibrary,
  onSaveToPlaylist,
  onRemoveFromPlaylist,
  onGoToAlbum,
  onGoToArtist,
  isInPlaylist = false,
  isLiked = false,
}: TrackOptionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { isDownloaded, isDownloading, download, removeDownload } = useOffline()

  const downloaded = track ? isDownloaded(track.videoId) : false
  const downloading = track ? isDownloading(track.videoId) : false

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleDownload = useCallback(async () => {
    if (!track || downloading) return
    setIsOpen(false)
    try {
      if (downloaded) {
        await removeDownload(track.videoId)
      } else {
        await download(track)
      }
    } catch (err) {
      console.error('Download action failed:', err)
    }
  }, [track, downloading, downloaded, download, removeDownload])

  if (!track) return null

  const hasQueueSection = Boolean(onStartMix || onPlayNext || onAddToQueue)
  const hasLibrarySection = Boolean(
    onSaveToLibrary || onSaveToPlaylist || (isInPlaylist && onRemoveFromPlaylist)
  )
  const hasNavigationSection = Boolean((track.album && onGoToAlbum) || (track.artist && onGoToArtist))

  return (
    <div className="track-options-container" ref={menuRef}>
      <button
        className="track-options-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        title="More options"
        aria-label="More options"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isOpen && (
        <div className="track-options-dropdown">
          {onStartMix && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onStartMix(track)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <span>Start mix</span>
            </button>
          )}

          {onPlayNext && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onPlayNext(track)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
              <span>Play next</span>
            </button>
          )}

          {onAddToQueue && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onAddToQueue(track)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v4h-2v-4h-4v-2h4V8h2v4h4v2h-4z" />
              </svg>
              <span>Add to queue</span>
            </button>
          )}

          {hasQueueSection && (hasLibrarySection || hasNavigationSection) && (
            <div className="track-options-divider" />
          )}

          {onSaveToLibrary && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onSaveToLibrary(track)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-8-2h2v-4h4v-2h-4V7h-2v4H7v2h4z" />
              </svg>
              <span>{isLiked ? 'Remove from library' : 'Save to library'}</span>
            </button>
          )}

          {onSaveToPlaylist && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onSaveToPlaylist(track)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
              </svg>
              <span>Save to playlist</span>
            </button>
          )}

          {isInPlaylist && onRemoveFromPlaylist && (
            <button
              className="track-option-item text-danger"
              onClick={() => {
                setIsOpen(false)
                onRemoveFromPlaylist(track)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              <span>Remove from playlist</span>
            </button>
          )}

          {hasLibrarySection && hasNavigationSection && (
            <div className="track-options-divider" />
          )}

          {track.album && onGoToAlbum && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onGoToAlbum(track.album!)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
              </svg>
              <span>Go to album</span>
            </button>
          )}

          {track.artist && onGoToArtist && (
            <button
              className="track-option-item"
              onClick={() => {
                setIsOpen(false)
                onGoToArtist(track.artist)
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              <span>Go to artist</span>
            </button>
          )}

          <div className="track-options-divider" />

          <button
            className={`track-option-item ${downloading ? 'track-option-item-disabled' : ''}`}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                className="track-option-spinner"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : downloaded ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
            )}
            <span>
              {downloading ? 'Downloading…' : downloaded ? 'Remove download' : 'Download'}
            </span>
          </button>

          <button
            className="track-option-item"
            onClick={() => {
              setIsOpen(false)
              navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${track.videoId}`)
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z" />
            </svg>
            <span>Share</span>
          </button>
        </div>
      )}
    </div>
  )
}
