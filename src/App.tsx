import { useEffect, useRef, useState } from 'react'
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
import { searchPipedTracks, searchPipedTracksSimple } from './utils/piped'
import { handleSpotifyRedirect } from './utils/spotifyAuth'
import { PlaylistHeader } from './components/PlaylistHeader'
import type { Track } from './types'
import './App.css'

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined

const MOOD_CHIPS = ['Relax', 'Energise', 'Party', 'Focus', 'Sleep', 'Workout', 'Sad', 'Romance'] as const

function App() {
  const { user, loading: authLoading } = useAuth()
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
  const [activeArtist, setActiveArtist] = useState<string | null>(null)
  const [artistTracks, setArtistTracks] = useState<Track[]>([])
  const [loadingArtist, setLoadingArtist] = useState(false)
  const [quickPicks, setQuickPicks] = useState<Track[]>([])
  const [loadingQuickPicks, setLoadingQuickPicks] = useState(false)

  useEffect(() => {
    handleSpotifyRedirect().then((justLoggedIn) => {
      if (justLoggedIn) setSpotifyModalOpen(true)
    })
  }, [])

  const ytContainerRef = useRef<HTMLDivElement>(null!)
  const loadingMoreRef = useRef(false)
  const player = useYouTubePlayer(ytContainerRef)
  const { playlists, createPlaylist, reorderPlaylistTracks, removeTrackFromPlaylist } = usePlaylists()
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

  // Quick picks from last played / playlist seed
  useEffect(() => {
    if (view !== 'home') return

    const seed =
      player.current ??
      player.queue[0] ??
      playlists.find((p) => p.tracks.length > 0)?.tracks[0]

    if (!seed) {
      setQuickPicks([])
      return
    }

    let cancelled = false
    setLoadingQuickPicks(true)

    searchPipedTracksSimple(`${seed.artist} ${seed.title}`)
      .then((tracks) => {
        if (cancelled) return
        setQuickPicks(tracks.filter((t) => t.videoId !== seed.videoId).slice(0, 12))
      })
      .catch(() => {
        if (!cancelled) setQuickPicks([])
      })
      .finally(() => {
        if (!cancelled) setLoadingQuickPicks(false)
      })

    return () => {
      cancelled = true
    }
  }, [view, player.current?.videoId, playlists.length])

  const search = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)

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
      setError(
        'Search is temporarily unavailable (all Piped instances failed to respond, and no Google API key is configured as a fallback).'
      )
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

  const runMoodSearch = async (chip: string) => {
    setQuery(chip)
    setLoading(true)
    setError(null)
    setView('search')
    try {
      const tracks = await searchPipedTracksSimple(chip)
      setResults(tracks)
      setSearchBackend('piped')
      setNextPageToken(null)
    } catch {
      setError('Could not load that mood right now.')
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

  const handleOpenArtist = async (artist: string) => {
    setActiveArtist(artist)
    setView('artist')
    setLoadingArtist(true)
    try {
      const tracks = await searchPipedTracksSimple(artist)
      setArtistTracks(tracks)
    } catch (err) {
      console.error('Artist lookup failed:', err)
      setArtistTracks([])
    } finally {
      setLoadingArtist(false)
    }
  }

  const handlePlay = (track: Track, source?: Track[]) => {
    if (source) {
      player.playTrack(track, source)
      return
    }
    const resolvedSource =
      view === 'playlist'
        ? activePlaylist?.tracks ?? []
        : view === 'artist'
          ? artistTracks
          : view === 'home'
            ? quickPicks.length
              ? quickPicks
              : player.queue
            : results
    player.playTrack(track, resolvedSource)
  }

  const handleStartMix = (track: Track) => {
    const source =
      view === 'playlist'
        ? activePlaylist?.tracks ?? [track]
        : view === 'artist'
          ? artistTracks.length
            ? artistTracks
            : [track]
          : view === 'home'
            ? quickPicks.length
              ? quickPicks
              : player.queue.length
                ? player.queue
                : [track]
            : results.length
              ? results
              : [track]
    if (!player.shuffle) player.toggleShuffle()
    player.playTrack(track, source)
  }

  const handleSpotifyImportSuccess = (playlistName: string, tracks: Track[]) => {
    const newPlaylistId = createPlaylist(playlistName, tracks)
    if (newPlaylistId) {
      setActivePlaylistId(newPlaylistId)
      setView('playlist')
    }
  }

  const gridQueueHandlers = {
    onPlayNext: player.playNext,
    onAddToQueue: player.addToQueue,
    onStartMix: handleStartMix,
  }

  if (authLoading) {
    return <div className="app-loading">Loading...</div>
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

      <div className="app-main" style={{ position: 'relative', zIndex: 1 }}>
        {/* Hide search on Home, Library, Flow + Settings for mobile via CSS */}
        <div
          className={`topbar-wrap ${
            view === 'playlist'
              ? 'topbar-hide'
              : view === 'home' || view === 'library' || view === 'flow' || view === 'settings'
                ? 'topbar-hide-mobile'
                : ''
            }`}
          >
            <TopBar query={query} onQueryChange={setQuery} onSearch={search} loading={loading} />
        </div>

        <main className="content" onScroll={handleContentScroll}>
          {error && <p className="error-banner">{error}</p>}

          {view === 'home' && (
            <>
              <header className="home-header">
                <h1 className="home-app-name">
                  <span className="accent-text">Zelmir</span>
                </h1>
                <div className="home-profile" title={user.username}>
                  <div className="home-profile-avatar accent-fill">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                </div>
              </header>

              {/* Mood chips — mobile + desktop */}
              <div className="home-chips">
                {MOOD_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="home-chip"
                    onClick={() => runMoodSearch(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Listen again / Jump back in — playlists */}
              <section className="home-section">
                <div className="home-section-header">
                  <h2 className="section-heading">Listen again</h2>
                </div>
                {playlists.length === 0 ? (
                  <p className="empty-state">Create a playlist to see it here.</p>
                ) : (
                  <div className="home-playlist-grid">
                    {playlists.map((pl) => {
                      const art = pl.tracks[0]?.thumbnail
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          className="home-playlist-tile"
                          onClick={() => handleOpenPlaylist(pl.id)}
                        >
                          <div className="home-playlist-tile-art">
                            {art ? (
                              <img src={art} alt="" />
                            ) : (
                              <div className="home-playlist-tile-empty" />
                            )}
                            {pl.tracks.length > 0 && (
                              <span className="home-playlist-tile-play" aria-hidden>
                                ▶
                              </span>
                            )}
                          </div>
                          <span className="home-playlist-tile-name">{pl.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Quick picks */}
              <section className="home-section">
                <div className="home-section-header">
                  <h2 className="section-heading">Quick picks</h2>
                  {quickPicks.length > 0 && (
                    <button
                      type="button"
                      className="home-play-all"
                      onClick={() => handlePlay(quickPicks[0], quickPicks)}
                    >
                      Play all
                    </button>
                  )}
                </div>
                {loadingQuickPicks ? (
                  <p className="empty-state">Finding tracks for you…</p>
                ) : quickPicks.length === 0 ? (
                  <p className="empty-state">Play a few songs and we’ll suggest more here.</p>
                ) : (
                  <VideoGrid
                    tracks={quickPicks}
                    onPlay={handlePlay}
                    currentVideoId={player.current?.videoId}
                    emptyLabel=""
                    onOpenArtist={handleOpenArtist}
                    {...gridQueueHandlers}
                  />
                )}
              </section>

              {player.queue.length > 0 && (
                <section className="home-section">
                  <h2 className="section-heading">Recently played</h2>
                  <VideoGrid
                    tracks={player.queue}
                    onPlay={handlePlay}
                    currentVideoId={player.current?.videoId}
                    emptyLabel=""
                    onOpenArtist={handleOpenArtist}
                    {...gridQueueHandlers}
                  />
                </section>
              )}
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
                onOpenArtist={handleOpenArtist}
                {...gridQueueHandlers}
              />
              {loadingMore && <p className="loading-more">Loading more…</p>}
            </>
          )}

          {view === 'artist' && activeArtist && (
            <>
              <h2 className="section-heading">{activeArtist}</h2>
              {loadingArtist ? (
                <p className="empty-state">Loading…</p>
              ) : (
                <VideoGrid
                  tracks={artistTracks}
                  onPlay={handlePlay}
                  currentVideoId={player.current?.videoId}
                  emptyLabel="Couldn't find anything for this artist."
                  onOpenArtist={handleOpenArtist}
                  {...gridQueueHandlers}
                />
              )}
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
            <Flow apiKey={API_KEY} onPlay={handlePlay} currentVideoId={player.current?.videoId} />
          )}

          {view === 'playlist' && activePlaylist && (
            <>
              <PlaylistHeader name={activePlaylist.name} tracks={activePlaylist.tracks} />
              <VideoGrid
                tracks={activePlaylist.tracks}
                onPlay={handlePlay}
                currentVideoId={player.current?.videoId}
                emptyLabel="This playlist is empty — add songs from search or home using the + button."
                onOpenArtist={handleOpenArtist}
                onRemoveTrack={(videoId) =>
                  activePlaylistId && removeTrackFromPlaylist(activePlaylistId, videoId)
                }
                reorderable
                onReorder={(tracks) => activePlaylistId && reorderPlaylistTracks(activePlaylistId, tracks)}
                {...gridQueueHandlers}
              />
            </>
          )}

          {view === 'settings' && <ThemeSettings />}
        </main>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
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
      </div>

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
            shuffle={player.shuffle}
            repeatMode={player.repeatMode}
            onClose={() => setNowPlayingOpen(false)}
            onToggle={player.togglePlay}
            onNext={player.next}
            onPrev={player.prev}
            onToggleShuffle={player.toggleShuffle}
            onCycleRepeat={player.cycleRepeat}
            onPlayFromQueue={(track, source) => player.playTrack(track, source)}
            onOpenArtist={(artist) => {
              setNowPlayingOpen(false)
              handleOpenArtist(artist)
            }}
          />
        </ErrorBoundary>
      )}

      <SpotifyImportModal
        isOpen={spotifyModalOpen}
        onClose={() => setSpotifyModalOpen(false)}
        onImportSuccess={handleSpotifyImportSuccess}
        youtubeApiKey={API_KEY}
      />

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