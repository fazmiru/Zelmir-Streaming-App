import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Track } from '../types'
import { useAuth } from '../auth/AuthContext'
import {
  downloadTrack as offlineDownload,
  ensureLocalAudioForDownloads,
  getDownloadedTracks,
  isTrackDownloaded,
  removeOfflineTrack as offlineRemove,
  syncDownloadsFromCloud,
  type OfflineTrack,
} from '../utils/offline'

interface OfflineContextValue {
  downloadedIds: Set<string>
  downloads: OfflineTrack[]
  downloadingIds: Set<string>
  isDownloaded: (videoId: string) => boolean
  isDownloading: (videoId: string) => boolean
  download: (track: Track) => Promise<void>
  removeDownload: (videoId: string) => Promise<void>
  refresh: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue | null>(null)

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [downloads, setDownloads] = useState<OfflineTrack[]>([])
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set())

  const refresh = useCallback(async () => {
    if (user) {
      const list = await syncDownloadsFromCloud(user.id)
      setDownloads(list)
      // Best-effort: fill missing audio blobs on this device in the background
      void ensureLocalAudioForDownloads(list, async () => {
        const next = await getDownloadedTracks()
        setDownloads(next)
      })
    } else {
      const list = await getDownloadedTracks()
      setDownloads(list)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [authLoading, refresh])

  const downloadedIds = useMemo(() => new Set(downloads.map((t) => t.videoId)), [downloads])

  const isDownloaded = useCallback((videoId: string) => downloadedIds.has(videoId), [downloadedIds])

  const isDownloading = useCallback(
    (videoId: string) => downloadingIds.has(videoId),
    [downloadingIds]
  )

  const download = useCallback(
    async (track: Track) => {
      if (downloadingIds.has(track.videoId)) return
      setDownloadingIds((prev) => new Set(prev).add(track.videoId))
      try {
        await offlineDownload(track, user?.id)
        const list = await getDownloadedTracks()
        setDownloads(list)
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev)
          next.delete(track.videoId)
          return next
        })
      }
    },
    [user?.id, downloadingIds]
  )

  const removeDownload = useCallback(
    async (videoId: string) => {
      await offlineRemove(videoId, user?.id)
      setDownloads((prev) => prev.filter((t) => t.videoId !== videoId))
    },
    [user?.id]
  )

  const value = useMemo(
    () => ({
      downloadedIds,
      downloads,
      downloadingIds,
      isDownloaded,
      isDownloading,
      download,
      removeDownload,
      refresh,
    }),
    [
      downloadedIds,
      downloads,
      downloadingIds,
      isDownloaded,
      isDownloading,
      download,
      removeDownload,
      refresh,
    ]
  )

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline() {
  const ctx = useContext(OfflineContext)
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider')
  return ctx
}

/** Safe check without throwing when provider is absent (e.g. tests). */
export async function checkDownloaded(videoId: string): Promise<boolean> {
  return isTrackDownloaded(videoId)
}
