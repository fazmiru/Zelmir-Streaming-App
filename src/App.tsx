import { useRef, useState } from 'react'
import { Sidebar, type View } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { VideoGrid } from './components/VideoGrid'
import { Flow } from './components/Flow'
import { PlayerBar } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeSettings } from './components/ThemeSettings'
import { AuthScreen } from './components/AuthScreen'
import { SpotifyImportModal } from './components/SpotifyImportModal'
import { useYouTubePlayer } from './hooks/useYouTubePlayer'
import { usePlaylists } from './playlists/PlaylistContext'
import { useAuth } from './auth/AuthContext'
import { toTrack, filterOutShorts } from './utils/youtube'
import { searchPipedTracks } from './utils/piped'
import type { Track } from './types'
import './App.css'

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined

function App() {
  const { user } = useAuth()
  const [view, setView] = useState<View>('home')
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [searchBackend, setSearchBackend] = useState<'piped' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false)

  // FIX: Using null! satisfies both TypeScript and useYouTubePlayer
  const ytContainerRef = useRef<HTMLDivElement>(null!)
  const loadingMoreRef = useRef(false)
  const player = useYouTubePlayer(ytContainerRef)
  const { playlists, createPlaylist, reorderPlaylistTracks } = usePlaylists()
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)

    // Try Piped first — no API key, no quota. Only fall back to Google if every
    // Piped instance failed to respond (see utils/piped.ts for the instance list).
    try {
      const { tracks, nextpage } = await searchPipedTracks(query)
      setResults(tracks)
      setNextPageToken(nextpage)
      setSearchBackend('piped')
      setView('search')
      setLoading(false)
      return
    } catch (pipedErr) {
      console.warn('Piped search failed, falling back to Google API:', pipedErr)
    }

    if (!API_KEY) {
      setError('Search is temporarily unavailable (all Piped instances failed to respond, and no Google API key is configured as a fallback).')
      setLoading(false)
      return
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
          query
        )}&type=video&videoDuration=any&maxResults=25&key=${API_KEY}`
      )
      if (!response.ok) throw new Error(`YouTube API returned ${response.status}`)
      const data = await response.json()
      const filtered = await filterOutShorts(data.items || [], API_KEY)
      setResults(filtered.map(toTrack))
      setNextPageToken(data.nextPageToken ?? null)
      setSearchBackend('google')
      setView('search')
    } catch (err) {
      console.error('Search failed:', err)
      setError('Search failed on both Piped and Google. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  const loadMoreResults = async () => {
    if (!nextPageToken || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      if (searchBackend === 'piped') {
        const { tracks, nextpage } = await searchPipedTracks(query, nextPageToken)
        const existingIds = new Set(results.map((t) => t.videoId))
        setResults((prev) => [...prev, ...tracks.filter((t) => !existingIds.has(t.videoId))])
        setNextPageToken(nextpage)
      } else if (searchBackend === 'google' && API_KEY) {
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
            query
          )}&type=video&videoDuration=any&maxResults=25&pageToken=${nextPageToken}&key=${API_KEY}`
        )
        if (!response.ok) throw new Error(`YouTube API returned ${response.status}`)
        const data = await response.json()
        const filtered = await filterOutShorts(data.items || [], API_KEY)
        const existingIds = new Set(results.map((t) => t.videoId))
        const newTracks = filtered.map(toTrack).filter((t) => !existingIds.has(t.videoId))
        setResults((prev) => [...prev, ...newTracks])
        setNextPageToken(data.nextPageToken ?? null)
      }
    } catch (err) {
      console.error('Loading more results failed:', err)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }

  const handleContentScroll = (e: React.UIEvent<HTMLElement>) => {
    if (view !== 'search') return
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 400
    if (nearBottom) loadMoreResults()
  }

  const handleOpenPlaylist = (id: string) => {
    setActivePlaylistId(id)
    setView('playlist')
  }

  const handlePlay = (track: Track, source?: Track[]) => {
    if (source) {
      player.playTrack(track, source)
      return
    }
    const resolvedSource = view === 'playlist' ? activePlaylist?.tracks ?? [] : results
    player.playTrack(track, resolvedSource)
  }

const handleSpotifyImportSuccess = (playlistName: string, tracks: Track[]) => {
  const newPlaylistId = createPlaylist(playlistName, tracks)
  if (newPlaylistId) {
    setActivePlaylistId(newPlaylistId)
    setView('playlist')
  }
}

  if (!user) {
    return <AuthScreen />
  }

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        activePlaylistId={activePlaylistId}
        onNavigate={setView}
        onOpenPlaylist={handleOpenPlaylist}
        onOpenSpotifyImport={() => setSpotifyModalOpen(true)}
      />

      <div className="app-main">
        <TopBar query={query} onQueryChange={setQuery} onSearch={search} loading={loading} />

        <main className="content" onScroll={handleContentScroll}>
          {error && <p className="error-banner">{error}</p>}

          {view === 'home' && (
            <>
              <section className="hero">
                <h1>
                  Welcome to <span className="accent-text">Zelmir</span>
                </h1>
                <p>Search anything, and it plays. No ads. Your playlists and theme are saved to your account.</p>
              </section>
              <h2 className="section-heading">Recently played</h2>
              <VideoGrid
                tracks={player.queue}
                onPlay={handlePlay}
                currentVideoId={player.current?.videoId}
                emptyLabel="Search for a song to get started."
              />
            </>
          )}

          {view === 'search' && (
            <>
              <h2 className="section-heading">Results for "{query}"</h2>
              <VideoGrid
                tracks={results}
                onPlay={handlePlay}
                currentVideoId={player.current?.videoId}
                emptyLabel="No results yet — try searching above."
              />
              {loadingMore && <p className="loading-more">Loading more…</p>}
            </>
          )}

          {view === 'library' && (
            <>
              <h2 className="section-heading">Your library</h2>
              {playlists.length === 0 ? (
                <p className="empty-state">
                  No playlists yet — create one from the sidebar, or the + button on any song.
                </p>
              ) : (
                <div className="library-grid">
                  {playlists.map((pl) => (
                    <button key={pl.id} className="library-card" onClick={() => handleOpenPlaylist(pl.id)}>
                      <div className="library-card-art">
                        {pl.tracks[0] ? (
                          <img src={pl.tracks[0].thumbnail} alt="" />
                        ) : (
                          <div className="library-card-art-empty" />
                        )}
                      </div>
                      <span className="library-card-name">{pl.name}</span>
                      <span className="library-card-count">
                        {pl.tracks.length} song{pl.tracks.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'flow' && (
            <Flow
              apiKey={API_KEY}
              onPlay={handlePlay}
              currentVideoId={player.current?.videoId}
            />
          )}

          {view === 'playlist' && activePlaylist && (
            <>
              <h2 className="section-heading">{activePlaylist.name}</h2>
              <VideoGrid
                tracks={activePlaylist.tracks}
                onPlay={handlePlay}
                currentVideoId={player.current?.videoId}
                emptyLabel="This playlist is empty — add songs from search or home using the + button."
                reorderable
                onReorder={(tracks) => activePlaylistId && reorderPlaylistTracks(activePlaylistId, tracks)}
              />
            </>
          )}

          {view === 'settings' && <ThemeSettings />}
        </main>
      </div>

      <PlayerBar
        current={player.current}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        volume={player.volume}
        shuffle={player.shuffle}
        repeatMode={player.repeatMode}
        onToggle={player.togglePlay}
        onNext={player.next}
        onPrev={player.prev}
        onSeek={player.seekTo}
        onVolume={player.setVolume}
        onToggleShuffle={player.toggleShuffle}
        onCycleRepeat={player.cycleRepeat}
        onOpenNowPlaying={() => setNowPlayingOpen(true)}
      />

      {nowPlayingOpen && player.current && (
        <ErrorBoundary
          fallback={(reset) => (
            <div className="now-playing-overlay now-playing-error">
              <p>Now Playing hit a snag and had to close.</p>
              <button
                className="accent-fill now-playing-error-button"
                onClick={() => {
                  reset()
                  setNowPlayingOpen(false)
                }}
              >
                Close
              </button>
            </div>
          )}
        >
          <NowPlaying
            track={player.current}
            queue={player.queue}
            queueIndex={player.queueIndex}
            isPlaying={player.isPlaying}
            apiKey={API_KEY}
            onClose={() => setNowPlayingOpen(false)}
            onToggle={player.togglePlay}
            onNext={player.next}
            onPrev={player.prev}
            onPlayFromQueue={(track, source) => player.playTrack(track, source)}
          />
        </ErrorBoundary>
      )}

      <SpotifyImportModal
        isOpen={spotifyModalOpen}
        onClose={() => setSpotifyModalOpen(false)}
        onImportSuccess={handleSpotifyImportSuccess}
        youtubeApiKey={API_KEY}
      />

      {/*
        Kept inside the viewport (bottom-right corner, 1x1px, invisible) rather than pushed
        off-screen with a huge negative offset. Some mobile browsers treat elements placed
        entirely outside the viewport as backgrounded and suspend their media playback, which
        was blocking playback on mobile while "request desktop site" (a different rendering
        path) masked the issue.
      */}
      <div
        ref={ytContainerRef}
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

export default App