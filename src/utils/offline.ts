import type { Track } from '../types'
import { supabase } from '../lib/supabaseClient'
import { PIPED_INSTANCES } from './piped'

const DB_NAME = 'zelmir-offline'
const DB_VERSION = 1
const STORE_TRACKS = 'tracks'
const STORE_BLOBS = 'blobs'

export type OfflineStatus = 'idle' | 'downloading' | 'downloaded' | 'error'

export interface OfflineTrack extends Track {
  downloadedAt: number
  /** true if we successfully cached an audio blob on this device */
  hasAudio: boolean
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'videoId' })
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'videoId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function putLocalTrack(offline: OfflineTrack): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_TRACKS, 'readwrite')
  tx.objectStore(STORE_TRACKS).put(offline)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteLocalTrack(videoId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction([STORE_TRACKS, STORE_BLOBS], 'readwrite')
  tx.objectStore(STORE_TRACKS).delete(videoId)
  tx.objectStore(STORE_BLOBS).delete(videoId)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function isTrackDownloaded(videoId: string): Promise<boolean> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_TRACKS, 'readonly')
    const row = await idbReq(tx.objectStore(STORE_TRACKS).get(videoId))
    return !!row
  } catch {
    return false
  }
}

export async function getDownloadedTracks(): Promise<OfflineTrack[]> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_TRACKS, 'readonly')
    const rows = await idbReq(tx.objectStore(STORE_TRACKS).getAll())
    return (rows as OfflineTrack[]) || []
  } catch {
    return []
  }
}

/** Cloud: save download metadata so other devices see the same library. */
async function cloudUpsert(userId: string, track: Track, downloadedAt: number): Promise<void> {
  const { error } = await supabase.from('downloaded_tracks').upsert(
    {
      user_id: userId,
      video_id: track.videoId,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
      album: track.album ?? null,
      downloaded_at: new Date(downloadedAt).toISOString(),
    },
    { onConflict: 'user_id,video_id' }
  )
  if (error) console.error('Failed to sync download to cloud:', error)
}

async function cloudRemove(userId: string, videoId: string): Promise<void> {
  const { error } = await supabase
    .from('downloaded_tracks')
    .delete()
    .eq('user_id', userId)
    .eq('video_id', videoId)
  if (error) console.error('Failed to remove cloud download:', error)
}

/**
 * Load the signed-in user's download list from Supabase and merge into local IndexedDB.
 * Audio blobs stay on-device — only metadata syncs. Call on login / app start.
 */
export async function syncDownloadsFromCloud(userId: string): Promise<OfflineTrack[]> {
  const { data, error } = await supabase
    .from('downloaded_tracks')
    .select('video_id, title, artist, thumbnail, album, downloaded_at')
    .eq('user_id', userId)
    .order('downloaded_at', { ascending: false })

  if (error) {
    console.error('Failed to load cloud downloads:', error)
    return getDownloadedTracks()
  }

  const local = await getDownloadedTracks()
  const localById = new Map(local.map((t) => [t.videoId, t]))
  const cloudIds = new Set((data ?? []).map((r) => r.video_id as string))

  // Upsert cloud rows into local metadata
  for (const row of data ?? []) {
    const videoId = row.video_id as string
    const existing = localById.get(videoId)
    const offline: OfflineTrack = {
      videoId,
      title: (row.title as string) || existing?.title || 'Unknown',
      artist: (row.artist as string) || existing?.artist || '',
      thumbnail: (row.thumbnail as string) || existing?.thumbnail || '',
      album: (row.album as string | null) || existing?.album,
      downloadedAt: row.downloaded_at ? new Date(row.downloaded_at as string).getTime() : Date.now(),
      hasAudio: existing?.hasAudio ?? false,
    }
    await putLocalTrack(offline)
  }

  // Keep local-only rows that aren't on cloud yet (upload them)
  for (const t of local) {
    if (!cloudIds.has(t.videoId)) {
      await cloudUpsert(userId, t, t.downloadedAt)
    }
  }

  return getDownloadedTracks()
}

/** Best-effort audio URL from Piped streams endpoint. */
async function fetchAudioStreamUrl(videoId: string): Promise<string | null> {
  let lastError: unknown = null
  for (const instance of PIPED_INSTANCES) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`${instance} ${res.status}`)
      const data = await res.json()
      const streams: Array<{ url: string; bitrate?: number; mimeType?: string; quality?: string }> =
        data.audioStreams || data.adaptiveFormats || []
      if (!streams.length) return null
      const sorted = [...streams].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
      return sorted[0]?.url ?? null
    } catch (err) {
      lastError = err
    } finally {
      clearTimeout(timeout)
    }
  }
  if (lastError) console.warn('Piped streams failed:', lastError)
  return null
}

async function tryCacheBlob(videoId: string, url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return false
    const blob = await res.blob()
    if (blob.size < 1024) return false
    const db = await openDb()
    const tx = db.transaction(STORE_BLOBS, 'readwrite')
    tx.objectStore(STORE_BLOBS).put({ videoId, blob, cachedAt: Date.now() })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return true
  } catch {
    return false
  }
}

/**
 * Marks a track for offline listening, caches audio on this device when possible,
 * and syncs metadata to the cloud so other devices see it in the download library.
 */
export async function downloadTrack(
  track: Track,
  userId?: string | null
): Promise<{ hasAudio: boolean }> {
  const audioUrl = await fetchAudioStreamUrl(track.videoId)
  let hasAudio = false
  if (audioUrl) {
    hasAudio = await tryCacheBlob(track.videoId, audioUrl)
  }

  const downloadedAt = Date.now()
  const offline: OfflineTrack = {
    ...track,
    downloadedAt,
    hasAudio,
  }

  await putLocalTrack(offline)

  if (userId) {
    await cloudUpsert(userId, track, downloadedAt)
  }

  return { hasAudio }
}

export async function removeOfflineTrack(videoId: string, userId?: string | null): Promise<void> {
  await deleteLocalTrack(videoId)
  if (userId) {
    await cloudRemove(userId, videoId)
  }
}

/** Download every track in a playlist sequentially. */
export async function downloadPlaylistTracks(
  tracks: Track[],
  userId?: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const total = tracks.length
  for (let i = 0; i < total; i++) {
    await downloadTrack(tracks[i], userId)
    onProgress?.(i + 1, total)
  }
}

export async function getOfflineAudioBlob(videoId: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE_BLOBS, 'readonly')
    const row = await idbReq<{ videoId: string; blob: Blob } | undefined>(
      tx.objectStore(STORE_BLOBS).get(videoId)
    )
    return row?.blob ?? null
  } catch {
    return null
  }
}

/**
 * On a new device, re-fetch and cache audio for tracks already in the cloud library
 * that don't have a local blob yet. Best-effort, non-blocking per track.
 */
export async function ensureLocalAudioForDownloads(
  tracks: OfflineTrack[],
  onOne?: (videoId: string, hasAudio: boolean) => void
): Promise<void> {
  for (const t of tracks) {
    if (t.hasAudio) continue
    const url = await fetchAudioStreamUrl(t.videoId)
    if (!url) {
      onOne?.(t.videoId, false)
      continue
    }
    const ok = await tryCacheBlob(t.videoId, url)
    if (ok) {
      await putLocalTrack({ ...t, hasAudio: true })
    }
    onOne?.(t.videoId, ok)
  }
}
