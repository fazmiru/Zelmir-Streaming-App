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
    return !!(row as OfflineTrack | undefined)?.hasAudio
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

  for (const t of local) {
    if (!cloudIds.has(t.videoId)) {
      await cloudUpsert(userId, t, t.downloadedAt)
    }
  }

  return getDownloadedTracks()
}

interface AudioStreamInfo {
  url: string
  bitrate?: number
  mimeType?: string
  codec?: string
}

/** Collect audio stream URLs from Piped (tries every instance). */
async function fetchAudioStreams(videoId: string): Promise<AudioStreamInfo[]> {
  const collected: AudioStreamInfo[] = []
  for (const instance of PIPED_INSTANCES) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal })
      if (!res.ok) continue
      const data = await res.json()
      const streams: AudioStreamInfo[] = data.audioStreams || []
      for (const s of streams) {
        if (s?.url) collected.push(s)
      }
      if (collected.length) break
    } catch {
      // try next instance
    } finally {
      clearTimeout(timeout)
    }
  }
  return collected.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
}

async function fetchBlobFromUrl(url: string): Promise<Blob | null> {
  // Direct CORS fetch
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (res.ok) {
      const blob = await res.blob()
      if (blob.size > 1024) return blob
    }
  } catch {
    // continue
  }

  // XHR fallback (sometimes behaves differently with CORS)
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', url, true)
      xhr.responseType = 'blob'
      xhr.timeout = 120000
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
          resolve(xhr.response.size > 1024 ? xhr.response : null)
        } else {
          resolve(null)
        }
      }
      xhr.onerror = () => resolve(null)
      xhr.ontimeout = () => resolve(null)
      xhr.send()
    })
    if (blob) return blob
  } catch {
    // continue
  }

  return null
}

async function tryCacheBlob(videoId: string, urls: string[]): Promise<boolean> {
  for (const url of urls) {
    const blob = await fetchBlobFromUrl(url)
    if (!blob) continue
    try {
      const db = await openDb()
      const tx = db.transaction(STORE_BLOBS, 'readwrite')
      tx.objectStore(STORE_BLOBS).put({ videoId, blob, cachedAt: Date.now() })
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      return true
    } catch {
      // try next url
    }
  }
  return false
}

/**
 * Marks a track for offline listening and caches audio on this device.
 * Throws if audio cannot be stored — metadata-only is not enough for offline play.
 */
export async function downloadTrack(
  track: Track,
  userId?: string | null
): Promise<{ hasAudio: boolean }> {
  const streams = await fetchAudioStreams(track.videoId)
  if (!streams.length) {
    throw new Error('Could not find an audio stream for this track. Try again later.')
  }

  const urls = streams.map((s) => s.url)
  const hasAudio = await tryCacheBlob(track.videoId, urls)

  if (!hasAudio) {
    throw new Error(
      'Could not save audio for offline use (stream blocked). Stay online and try again, or try another track.'
    )
  }

  const downloadedAt = Date.now()
  const offline: OfflineTrack = {
    ...track,
    downloadedAt,
    hasAudio: true,
  }

  await putLocalTrack(offline)

  if (userId) {
    await cloudUpsert(userId, track, downloadedAt)
  }

  return { hasAudio: true }
}

export async function removeOfflineTrack(videoId: string, userId?: string | null): Promise<void> {
  await deleteLocalTrack(videoId)
  if (userId) {
    await cloudRemove(userId, videoId)
  }
}

export async function downloadPlaylistTracks(
  tracks: Track[],
  userId?: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const total = tracks.length
  for (let i = 0; i < total; i++) {
    try {
      await downloadTrack(tracks[i], userId)
    } catch (err) {
      console.warn('Playlist track download failed:', tracks[i].videoId, err)
    }
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

export async function ensureLocalAudioForDownloads(
  tracks: OfflineTrack[],
  onOne?: (videoId: string, hasAudio: boolean) => void
): Promise<void> {
  for (const t of tracks) {
    if (t.hasAudio) {
      const existing = await getOfflineAudioBlob(t.videoId)
      if (existing) {
        onOne?.(t.videoId, true)
        continue
      }
    }
    try {
      const streams = await fetchAudioStreams(t.videoId)
      const ok = streams.length ? await tryCacheBlob(t.videoId, streams.map((s) => s.url)) : false
      if (ok) {
        await putLocalTrack({ ...t, hasAudio: true })
      }
      onOne?.(t.videoId, ok)
    } catch {
      onOne?.(t.videoId, false)
    }
  }
}
