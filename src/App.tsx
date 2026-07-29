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
import { useYouTubePlayer } from './hooks/useYouTubePlayer'
import { usePlaylists } from './playlists/PlaylistContext'
import { useAuth } from './auth/AuthContext'
import type { Track, YouTubeSearchItem } from './types'
import './App.css'

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined

function toTrack(item: YouTubeSearchItem): Track {
  return {
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium.url,
  }
}

function App() {
  const { user } = useAuth()
  const [view, setView] = useState<View>('home')
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)

  // FIX: Using null! satisfies both TypeScript and useYouTubePlayer
  const ytContainerRef = useRef<HTMLDivElement>(null!)
  const player = useYouTubePlayer(ytContainerRef)
  const { playlists } = usePlaylists()
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

  const search = async () => {
    if (!query.trim()) return
    if (!API_KEY) {
      setError('No YouTube API key found. Add VITE_YOUTUBE_API_KEY to your .env file.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
          query
        )}&type=video&maxResults=16&key=${API_KEY}`
      )
      if (!response.ok) throw new Error(`YouTube API returned ${response.status}`)
      const data = await response.json()
      const tracks: Track[] = (data.items || []).map(toTrack)
      setResults(tracks)
      setView('search')
    } catch (err) {
      console.error('Search failed:', err)
      setError('Search failed. Check your API key and quota.')
    } finally {
      setLoading(false)
    }
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

  if (!user) {
    return <AuthScreen />
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} activePlaylistId={activePlaylistId} onNavigate={setView} onOpenPlaylist={handleOpenPlaylist} />

      <div className="app-main">
        <TopBar query={query} onQueryChange={setQuery} onSearch={search} loading={loading} />

        <main className="content">
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

      {/* Render off-screen so browser media policies stay happy */}
      <div 
        ref={ytContainerRef} 
        style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, pointerEvents: 'none' }} 
      />
    </div>
  )
}

export default App
