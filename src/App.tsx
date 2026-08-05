import { useEffect, useRef, useState } from 'react'
import { Sidebar, type View } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { VideoGrid } from './components/VideoGrid'
import { Flow } from './components/Flow'
import { PlayerBar } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { ArtistPage } from './components/ArtistPage'
import { AlbumPage } from './components/AlbumPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ThemeSettings } from './components/ThemeSettings'
import { AmbientParticles } from './components/AmbientParticles'
import { useTheme } from './theme/ThemeContext'
import { AuthScreen } from './components/AuthScreen'
import { SpotifyImportModal } from './components/SpotifyImportModal'
import { useYouTubePlayer } from './hooks/useYouTubePlayer'
import { usePlaylists } from './playlists/PlaylistContext'
import { useAuth } from './auth/AuthContext'
import { toTrack, filterOutShorts } from './utils/youtube'
import { searchPipedTracks, searchPipedTracksSimple, fetchArtistChannel, searchArtistTracks, searchArtistTracksMore, searchArtistAlbums, fetchPlaylistTracks, fetchSimilarTracks } from './utils/piped'
import { handleSpotifyRedirect } from './utils/spotifyAuth'
import { PlaylistHeader } from './components/PlaylistHeader'
import type { Track } from './types'
import type { ArtistAlbum } from './utils/piped'
import './App.css'

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined

const MOOD_CHIPS = ['Relax', 'Energise', 'Party', 'Focus', 'Sleep', 'Workout', 'Sad', 'Romance'] as const

const MOOD_MIX_QUERIES: Record<string, { label: string; queries: string[] }> = {
  Relax: {
    label: 'FOR RELAXING',
    queries: ['chill lofi mix', 'relaxing ambient music', 'soft acoustic chill', 'peaceful piano calm'],
  },
  Energise: {
    label: 'FOR ENERGY',
    queries: ['energetic pop hits', 'upbeat electronic dance', 'high energy workout mix', 'motivational rock energy'],
  },
  Party: {
    label: 'FOR THE PARTY',
    queries: ['party anthems mix', 'dance club hits', 'hip hop party playlist', 'edm festival bangers'],
  },
  Focus: {
    label: 'FOR FOCUS',
    queries: ['focus study lofi', 'deep concentration music', 'instrumental focus beats', 'coding ambient focus'],
  },
  Sleep: {
    label: 'FOR SLEEP',
    queries: ['sleep ambient sounds', 'deep sleep music calm', 'night rain soft piano', 'dreamy atmospheric sleep'],
  },
  Workout: {
    label: 'FOR WORKOUT',
    queries: ['workout gym motivation', 'running high tempo', 'beast mode gym mix', 'cardio energy tracks'],
  },
  Sad: {
    label: 'FOR WHEN IT HURTS',
    queries: ['sad emotional songs', 'heartbreak ballads mix', 'melancholy indie sad', 'crying at night playlist'],
  },
  Romance: {
    label: 'FOR ROMANCE',
    queries: ['romantic love songs', 'r&b slow jams', 'intimate acoustic love', 'date night soft pop'],
  },
}

type MoodMix = {
  id: string
  title: string
  subtitle: string
  tracks: Track[]
}


function App() {
  const { user, loading: authLoading } = useAuth()
  const { ambient } = useTheme()
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
  const [artistDescription, setArtistDescription] = useState<string | null>(null)
  const [artistMeta, setArtistMeta] = useState<string | null>(null)
  const [artistCoverUrl, setArtistCoverUrl] = useState<string | null>(null)
  const [artistAvatarUrl, setArtistAvatarUrl] = useState<string | null>(null)
  const [artistAlbums, setArtistAlbums] = useState<ArtistAlbum[]>([])
  const [loadingArtistAlbums, setLoadingArtistAlbums] = useState(false)
  const [loadingArtistMore, setLoadingArtistMore] = useState(false)
  const [artistHasMore, setArtistHasMore] = useState(true)
  const [artistMoreSalt, setArtistMoreSalt] = useState(0)
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null)
  const [albumName, setAlbumName] = useState('')
  const [albumArtist, setAlbumArtist] = useState('')
  const [albumDescription, setAlbumDescription] = useState('')
  const [albumThumbnail, setAlbumThumbnail] = useState('')
  const [albumTracks, setAlbumTracks] = useState<Track[]>([])
  const [loadingAlbum, setLoadingAlbum] = useState(false)
  const [albumReleases, setAlbumReleases] = useState<ArtistAlbum[]>([])
  const [loadingAlbumReleases, setLoadingAlbumReleases] = useState(false)
  const [quickPicks, setQuickPicks] = useState<Track[]>([])
  const [loadingQuickPicks, setLoadingQuickPicks] = useState(false)
  const [quickPicksSalt, setQuickPicksSalt] = useState(0)
  const [activeMood, setActiveMood] = useState<string | null>(null)
  const [moodMixes, setMoodMixes] = useState<MoodMix[]>([])
  const [moodTracks, setMoodTracks] = useState<Track[]>([])
  const [moodLoading, setMoodLoading] = useState(false)

  const [playlistRecs, setPlaylistRecs] = useState<Track[]>([])
  const [loadingPlaylistRecs, setLoadingPlaylistRecs] = useState(false)
  const [playlistRecsSalt, setPlaylistRecsSalt] = useState(0)
  const [topbarScrolled, setTopbarScrolled] = useState(false)
  const playlistRecsRef = useRef<Track[]>([])
  const activePlaylistIdRef = useRef<string | null>(null)

  useEffect(() => {
    handleSpotifyRedirect().then((justLoggedIn) => {
      if (justLoggedIn) setSpotifyModalOpen(true)
    })
  }, [])

  useEffect(() => {
    setTopbarScrolled(false)
  }, [view])

  const ytContainerRef = useRef<HTMLDivElement>(null!)
  const loadingMoreRef = useRef(false)
  const playTrackRef = useRef<(track: Track, source?: Track[]) => void>(() => {})
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  const handleQueueEnded = () => {
    if (viewRef.current !== 'playlist') return
    const recs = playlistRecsRef.current
    if (!recs.length) return
    playTrackRef.current(recs[0], recs)
  }

  const player = useYouTubePlayer(ytContainerRef, { onQueueEnded: handleQueueEnded })
  useEffect(() => {
    playTrackRef.current = player.playTrack
  }, [player.playTrack])
  const { playlists, createPlaylist, reorderPlaylistTracks, removeTrackFromPlaylist } = usePlaylists()
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? null

  useEffect(() => {
    playlistRecsRef.current = playlistRecs
  }, [playlistRecs])
  useEffect(() => {
    activePlaylistIdRef.current = activePlaylistId
  }, [activePlaylistId])


  // Quick picks from last played / playlist seed (salt changes on Refresh)
  useEffect(() => {
    if (view !== 'home') return

    const seeds: Track[] = []
    if (player.current) seeds.push(player.current)
    for (const t of player.queue) {
      if (seeds.length >= 6) break
      if (!seeds.some((s) => s.videoId === t.videoId)) seeds.push(t)
    }
    for (const pl of playlists) {
      for (const t of pl.tracks.slice(0, 2)) {
        if (seeds.length >= 8) break
        if (!seeds.some((s) => s.videoId === t.videoId)) seeds.push(t)
      }
    }

    if (!seeds.length) {
      setQuickPicks([])
      return
    }

    let cancelled = false
    setLoadingQuickPicks(true)

    const exclude = new Set(seeds.map((s) => s.videoId))
    fetchSimilarTracks(seeds, exclude, 12, quickPicksSalt)
      .then((tracks) => {
        if (!cancelled) setQuickPicks(tracks)
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
  }, [view, player.current?.videoId, playlists.length, quickPicksSalt])

  // Playlist recommendations (similar tracks, refreshable)
  useEffect(() => {
    if (view !== 'playlist' || !activePlaylist?.tracks.length) {
      setPlaylistRecs([])
      return
    }

    let cancelled = false
    setLoadingPlaylistRecs(true)

    const exclude = new Set(activePlaylist.tracks.map((t) => t.videoId))
    // On refresh, also exclude what was just shown so the list actually changes
    if (playlistRecsSalt > 0) {
      for (const t of playlistRecsRef.current) exclude.add(t.videoId)
    }
    fetchSimilarTracks(activePlaylist.tracks, exclude, 12, playlistRecsSalt)
      .then((tracks) => {
        if (!cancelled) setPlaylistRecs(tracks)
      })
      .catch(() => {
        if (!cancelled) setPlaylistRecs([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPlaylistRecs(false)
      })

    return () => {
      cancelled = true
    }
  }, [view, activePlaylistId, activePlaylist?.tracks.length, playlistRecsSalt])

  // Reset salt when switching playlists so each opens fresh
  useEffect(() => {
    setPlaylistRecsSalt(0)
  }, [activePlaylistId])

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
    setActiveMood(chip)
    setView('mood')
    setError(null)
    setMoodLoading(true)
    setMoodMixes([])
    setMoodTracks([])
    try {
      const cfg = MOOD_MIX_QUERIES[chip] || {
        label: `FOR ${chip.toUpperCase()}`,
        queries: [chip, `${chip} mix`, `${chip} playlist`, `${chip} songs`],
      }
      const results = await Promise.all(
        cfg.queries.map((q) => searchPipedTracksSimple(q).catch(() => [] as Track[]))
      )
      const mixes: MoodMix[] = results.map((tracks, i) => {
        const list = tracks.slice(0, 12)
        const artists = [...new Set(list.map((t) => t.artist).filter(Boolean))].slice(0, 4)
        return {
          id: `${chip}-${i}`,
          title: i === results.length - 1 ? `${chip} Supermix` : `${chip} Mix ${String(i + 1).padStart(2, '0')}`,
          subtitle: artists.join(', ') || cfg.queries[i],
          tracks: list,
        }
      }).filter((m) => m.tracks.length > 0)

      setMoodMixes(mixes)
      // Flatten unique tracks for the "songs" row under mixes
      const seen = new Set<string>()
      const flat: Track[] = []
      for (const m of mixes) {
        for (const t of m.tracks) {
          if (seen.has(t.videoId)) continue
          seen.add(t.videoId)
          flat.push(t)
        }
      }
      setMoodTracks(flat)
    } catch {
      setError('Could not load that mood right now.')
    } finally {
      setMoodLoading(false)
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
    const el = e.currentTarget
    setTopbarScrolled(el.scrollTop > 4)

    if (view !== 'search') return
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
    setLoadingArtistAlbums(true)
    setArtistDescription(null)
    setArtistMeta(null)
    setArtistCoverUrl(null)
    setArtistAvatarUrl(null)
    setArtistAlbums([])
    setArtistHasMore(true)
    setArtistMoreSalt(0)
    let channelId: string | undefined
    try {
      const [tracks, channel] = await Promise.all([
        searchArtistTracks(artist),
        fetchArtistChannel(artist),
      ])
      setArtistTracks(tracks)
      setArtistHasMore(tracks.length >= 8)
      channelId = channel?.id

      if (channel) {
        if (channel.avatarUrl) {
          setArtistAvatarUrl(channel.avatarUrl)
          setArtistCoverUrl(channel.avatarUrl)
        } else if (channel.bannerUrl) {
          setArtistCoverUrl(channel.bannerUrl)
        }
        if (channel.description) setArtistDescription(channel.description)
        if (channel.subscribers != null && channel.subscribers > 0) {
          const n = channel.subscribers
          const pretty =
            n >= 1_000_000
              ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
              : n >= 1_000
                ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
                : String(n)
          setArtistMeta(`${pretty} subscribers`)
        }
      }
    } catch (err) {
      console.error('Artist lookup failed:', err)
      setArtistTracks([])
    } finally {
      setLoadingArtist(false)
    }

    void searchArtistAlbums(artist, channelId)
      .then((albums) => setArtistAlbums(albums))
      .catch(() => setArtistAlbums([]))
      .finally(() => setLoadingArtistAlbums(false))
  }

  const handleArtistShowMore = async () => {
    if (!activeArtist || loadingArtistMore) return
    setLoadingArtistMore(true)
    try {
      const more = await searchArtistTracksMore(activeArtist, artistTracks, artistMoreSalt)
      setArtistMoreSalt((s) => s + 1)
      if (more.length === 0) setArtistHasMore(false)
      else setArtistTracks((prev) => {
        const seen = new Set(prev.map((t) => t.videoId))
        return [...prev, ...more.filter((t) => !seen.has(t.videoId))]
      })
    } catch {
      setArtistHasMore(false)
    } finally {
      setLoadingArtistMore(false)
    }
  }

  const handleOpenAlbum = async (album: ArtistAlbum, artistHint?: string) => {
    setActiveAlbumId(album.id)
    setAlbumName(album.name)
    setAlbumArtist(artistHint || activeArtist || album.uploaderName)
    setAlbumThumbnail(album.thumbnail)
    setAlbumDescription('')
    setAlbumTracks([])
    setView('album')
    setLoadingAlbum(true)
    setLoadingAlbumReleases(true)
    setAlbumReleases([])
    try {
      const data = await fetchPlaylistTracks(album.id, API_KEY)
      setAlbumName(data.name || album.name)
      setAlbumDescription(data.description)
      setAlbumThumbnail(data.thumbnail || album.thumbnail)
      if (data.uploaderName) setAlbumArtist(data.uploaderName)
      let tracks = data.tracks
      // Last-resort: search album title and keep artist-matching uploads
      if (!tracks.length) {
        const q = `${album.name} ${artistHint || activeArtist || album.uploaderName || ''}`.trim()
        try {
          const found = await searchPipedTracksSimple(q)
          const artistNorm = (artistHint || activeArtist || album.uploaderName || '')
            .toLowerCase()
            .trim()
          tracks = artistNorm
            ? found.filter((t) => t.artist.toLowerCase().includes(artistNorm) || artistNorm.includes(t.artist.toLowerCase()))
            : found
          if (!tracks.length) tracks = found
        } catch {
          /* leave empty */
        }
      }
      setAlbumTracks(tracks)
    } catch (err) {
      console.error('Album load failed', err)
    } finally {
      setLoadingAlbum(false)
    }

    // Releases for you — based on liked / saved playlist seeds, not only this artist
    try {
      const liked =
        playlists.find((p) => p.name === 'Liked Songs')?.tracks ||
        playlists.flatMap((p) => p.tracks).slice(0, 20)
      const seeds = liked.length ? liked : artistTracks.slice(0, 5)
      if (seeds.length) {
        const similar = await fetchSimilarTracks(
          seeds,
          new Set(seeds.map((t) => t.videoId)),
          10,
          Date.now() % 50
        )
        // Map similar tracks into "release" cards (use track as single-ish release art)
        const recs: ArtistAlbum[] = similar.slice(0, 10).map((t) => ({
          id: `rec-${t.videoId}`,
          name: t.title,
          thumbnail: t.thumbnail,
          uploaderName: t.artist,
          videoCount: 0,
        }))
        // Also pull a few playlists related to seed artists
        const seedArtist = seeds[0]?.artist
        if (seedArtist) {
          try {
            const moreAlbums = await searchArtistAlbums(seedArtist)
            for (const a of moreAlbums) {
              if (a.id === album.id) continue
              if (recs.some((r) => r.id === a.id)) continue
              recs.push(a)
            }
          } catch {
            /* ignore */
          }
        }
        setAlbumReleases(recs.slice(0, 12))
      }
    } catch {
      setAlbumReleases([])
    } finally {
      setLoadingAlbumReleases(false)
    }
  }

  const handleArtistShuffle = () => {
    if (!artistTracks.length) return
    const shuffled = [...artistTracks].sort(() => Math.random() - 0.5)
    player.playTrack(shuffled[0], shuffled)
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
          : view === 'album'
            ? albumTracks
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
      <AmbientParticles ambient={ambient} />
      <Sidebar
        view={view}
        activePlaylistId={activePlaylistId}
        onNavigate={setView}
        onOpenPlaylist={handleOpenPlaylist}
        onOpenSpotifyImport={() => setSpotifyModalOpen(true)}
      />

    <div className="app-main" style={{ position: 'relative', zIndex: 1 }}>
            {/* Hide search on playlist (all sizes) / Home, Library, Flow, Settings (mobile only).
                topbar-scrolled adds the solid black bar after the user scrolls down. */}
            <div
              className={`topbar-wrap ${
                view === 'playlist'
                  ? 'topbar-hide'
                  : view === 'home' || view === 'mood' || view === 'library' || view === 'flow' || view === 'settings'
                    ? 'topbar-hide-mobile'
                    : ''
              } ${view === 'home' || view === 'mood' || view === 'artist' ? 'topbar-home' : ''} ${topbarScrolled ? 'topbar-scrolled' : ''}`}
            >
              <TopBar query={query} onQueryChange={setQuery} onSearch={search} loading={loading} />
            </div>

        <main
          className={`content ${view === 'artist' ? 'content-artist' : ''} ${view === 'home' || view === 'mood' ? 'content-home' : ''}`}
          onScroll={handleContentScroll}
        >
          {error && <p className="error-banner">{error}</p>}

          {view === 'home' && (
            <div className="home-view">
              {/* Theme-colored blurred backdrop (YouTube Music style) */}
              <div className="home-theme-backdrop" aria-hidden>
                <div className="home-theme-orb home-theme-orb-a" />
                <div className="home-theme-orb home-theme-orb-b" />
                <div className="home-theme-orb home-theme-orb-c" />
                <div className="home-theme-orb home-theme-orb-d" />
                {player.current?.thumbnail && (
                  <div
                    className="home-now-art"
                    style={{ backgroundImage: `url(${player.current.thumbnail})` }}
                  />
                )}
                <div className="home-theme-shade" />
              </div>
              <header className="home-header">
                <div className="home-header-text">
                  <p className="home-greeting">
                    {(() => {
                      const h = new Date().getHours()
                      if (h < 12) return 'Good morning'
                      if (h < 18) return 'Good afternoon'
                      return 'Good evening'
                    })()}
                    {user.username ? `, ${user.username}` : ''}
                  </p>
                  <h1 className="home-app-name">
                    <span className="accent-text">Zelmir</span>
                  </h1>
                  <p className="home-tagline">Pick a mood or jump back in</p>
                </div>
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
                    className={`home-chip home-chip-${chip.toLowerCase()} ${activeMood === chip ? 'home-chip-active' : ''}`}
                    data-mood={chip.toLowerCase()}
                    onClick={() => runMoodSearch(chip)}
                  >
                    <span className="home-chip-dot" aria-hidden />
                    {chip}
                  </button>
                ))}
              </div>

              {/* Listen again / Jump back in — playlists */}
              <section className="home-section">
                <div className="home-section-header">
                  <div>
                    <h2 className="section-heading">Jump back in</h2>
                    <p className="home-section-sub">Playlists & recent listens</p>
                  </div>
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
                              <div className="home-playlist-tile-empty">
                                <span>{pl.name.charAt(0).toUpperCase()}</span>
                              </div>
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
                  <div>
                    <h2 className="section-heading">Quick picks</h2>
                    <p className="home-section-sub">Made for you right now</p>
                  </div>
                  <div className="home-section-actions">
                    <button
                      type="button"
                      className="home-refresh-btn"
                      disabled={loadingQuickPicks}
                      onClick={() => setQuickPicksSalt((s) => s + 1)}
                      title="Refresh recommendations"
                    >
                      Refresh
                    </button>
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
                  <div className="home-section-header">
                    <div>
                      <h2 className="section-heading">Recently played</h2>
                      <p className="home-section-sub">Pick up where you left off</p>
                    </div>
                  </div>
                  <div className="home-playlist-grid home-recent-grid">
                    {player.queue.slice(0, 12).map((t) => (
                      <button
                        key={t.videoId}
                        type="button"
                        className="home-playlist-tile"
                        onClick={() => handlePlay(t, player.queue)}
                      >
                        <div className="home-playlist-tile-art">
                          {t.thumbnail ? (
                            <img src={t.thumbnail} alt="" />
                          ) : (
                            <div className="home-playlist-tile-empty">
                              <span>{t.title.charAt(0)}</span>
                            </div>
                          )}
                          <span className="home-playlist-tile-play" aria-hidden>▶</span>
                        </div>
                        <span className="home-playlist-tile-name">{t.title}</span>
                        <span className="home-playlist-tile-sub">{t.artist}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          
          {view === 'mood' && activeMood && (
            <div className="mood-view">
              <div className="home-theme-backdrop mood-backdrop" aria-hidden>
                <div className="home-theme-orb home-theme-orb-a" />
                <div className="home-theme-orb home-theme-orb-b" />
                <div className="home-theme-shade" />
              </div>

              <div className="home-chips mood-chips-bar">
                {MOOD_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={`home-chip home-chip-${chip.toLowerCase()} ${activeMood === chip ? 'home-chip-active' : ''}`}
                    data-mood={chip.toLowerCase()}
                    onClick={() => runMoodSearch(chip)}
                  >
                    <span className="home-chip-dot" aria-hidden />
                    {chip}
                  </button>
                ))}
              </div>

              <p className="mood-kicker">
                {(MOOD_MIX_QUERIES[activeMood]?.label) || `FOR ${activeMood.toUpperCase()}`}
              </p>
              <div className="mood-title-row">
                <h1 className="mood-title">Mixed for you</h1>
                {!moodLoading && moodTracks.length > 0 && (
                  <button
                    type="button"
                    className="home-play-all"
                    onClick={() => handlePlay(moodTracks[0], moodTracks)}
                  >
                    Play all
                  </button>
                )}
              </div>

              {moodLoading && <p className="empty-state">Building your {activeMood.toLowerCase()} mixes…</p>}

              {!moodLoading && moodMixes.length > 0 && (
                <div className="mood-mix-row">
                  {moodMixes.map((mix) => {
                    const cover = mix.tracks[0]?.thumbnail
                    const cover2 = mix.tracks[1]?.thumbnail
                    const cover3 = mix.tracks[2]?.thumbnail
                    const cover4 = mix.tracks[3]?.thumbnail
                    return (
                      <button
                        key={mix.id}
                        type="button"
                        className="mood-mix-card"
                        onClick={() => {
                          if (mix.tracks[0]) handlePlay(mix.tracks[0], mix.tracks)
                        }}
                      >
                        <div className="mood-mix-art">
                          {cover ? (
                            <div className="mood-mix-collage">
                              <img src={cover} alt="" />
                              {cover2 && <img src={cover2} alt="" />}
                              {cover3 && <img src={cover3} alt="" />}
                              {cover4 && <img src={cover4} alt="" />}
                            </div>
                          ) : (
                            <div className="mood-mix-art-empty" />
                          )}
                          <span className="mood-mix-label">{mix.title}</span>
                          <span className="mood-mix-play" aria-hidden>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          </span>
                        </div>
                        <span className="mood-mix-name">{mix.title}</span>
                        <span className="mood-mix-sub">{mix.subtitle}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {!moodLoading && moodTracks.length > 0 && (
                <section className="home-section" style={{ marginTop: 28 }}>
                  <h2 className="section-heading">Songs</h2>
                  <VideoGrid
                    tracks={moodTracks}
                    onPlay={handlePlay}
                    currentVideoId={player.current?.videoId}
                    emptyLabel=""
                    onOpenArtist={handleOpenArtist}
                    {...gridQueueHandlers}
                  />
                </section>
              )}

              {!moodLoading && moodMixes.length === 0 && !error && (
                <p className="empty-state">No mixes found — try another mood.</p>
              )}
            </div>
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
            <ArtistPage
              artist={activeArtist}
              tracks={artistTracks}
              albums={artistAlbums}
              loading={loadingArtist}
              loadingMore={loadingArtistMore}
              loadingAlbums={loadingArtistAlbums}
              hasMore={artistHasMore}
              description={artistDescription}
              subscriberText={artistMeta}
              coverUrl={artistCoverUrl}
              avatarUrl={artistAvatarUrl}
              currentVideoId={player.current?.videoId}
              onPlay={handlePlay}
              onShufflePlay={handleArtistShuffle}
              onShowMore={handleArtistShowMore}
              onOpenAlbum={(al) => void handleOpenAlbum(al, activeArtist)}
              onOpenArtist={handleOpenArtist}
              {...gridQueueHandlers}
            />
          )}

          {view === 'album' && activeAlbumId && (
            <AlbumPage
              name={albumName}
              artist={albumArtist}
              description={albumDescription}
              thumbnail={albumThumbnail}
              tracks={albumTracks}
              loading={loadingAlbum}
              releases={albumReleases}
              loadingReleases={loadingAlbumReleases}
              currentVideoId={player.current?.videoId}
              onPlay={handlePlay}
              onPlayAll={() => {
                if (albumTracks[0]) player.playTrack(albumTracks[0], albumTracks)
              }}
              onOpenRelease={(rel) => {
                if (rel.id.startsWith('rec-')) {
                  const vid = rel.id.replace(/^rec-/, '')
                  const track =
                    albumTracks.find((t) => t.videoId === vid) ||
                    ({
                      videoId: vid,
                      title: rel.name,
                      artist: rel.uploaderName,
                      thumbnail: rel.thumbnail,
                    } as Track)
                  player.playTrack(track)
                  return
                }
                void handleOpenAlbum({
                  id: rel.id,
                  name: rel.name,
                  thumbnail: rel.thumbnail,
                  uploaderName: rel.uploaderName || albumArtist,
                  videoCount: rel.videoCount || 0,
                })
              }}
              onOpenArtist={handleOpenArtist}
              {...gridQueueHandlers}
            />
          )}

          {view === 'library' && (
            <div className="library-view">
              <header className="library-header">
                <h1 className="library-title">Library</h1>
              </header>

              <div className="library-chips" role="tablist" aria-label="Library filters">
                <button type="button" className="library-chip library-chip-active" role="tab" aria-selected="true">
                  Playlists
                </button>
              </div>

              {playlists.length === 0 ? (
                <p className="empty-state">
                  No playlists yet — create one from the sidebar, or the + button on any song.
                </p>
              ) : (
                <div className="library-list">
                  {playlists.map((pl) => {
                    const art = pl.tracks[0]?.thumbnail
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        className="library-row"
                        onClick={() => handleOpenPlaylist(pl.id)}
                      >
                        <div className="library-row-art">
                          {art ? (
                            <img src={art} alt="" />
                          ) : (
                            <div className="library-row-art-empty" />
                          )}
                        </div>
                        <div className="library-row-meta">
                          <span className="library-row-name">{pl.name}</span>
                          <span className="library-row-sub">
                            Playlist · {pl.tracks.length} song{pl.tracks.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              <button
                type="button"
                className="library-fab"
                onClick={() => {
                  const name = window.prompt('Playlist name')
                  if (!name?.trim()) return
                  const id = createPlaylist(name.trim())
                  if (id) {
                    setActivePlaylistId(id)
                    setView('playlist')
                  }
                }}
              >
                <span className="library-fab-plus">+</span>
                New
              </button>
            </div>
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

              {activePlaylist.tracks.length > 0 && (
                <section className="recommended-section">
                  <div className="home-section-header">
                    <div>
                      <h2 className="section-heading">Recommended</h2>
                      <p className="recommended-subtitle">Based on what's in this playlist</p>
                    </div>
                    <div className="home-section-actions">
                      <button
                        type="button"
                        className="home-refresh-btn"
                        disabled={loadingPlaylistRecs}
                        onClick={() => setPlaylistRecsSalt((s) => s + 1)}
                        title="Refresh recommendations"
                      >
                        Refresh
                      </button>
                      {playlistRecs.length > 0 && (
                        <button
                          type="button"
                          className="home-play-all"
                          onClick={() => handlePlay(playlistRecs[0], playlistRecs)}
                        >
                          Play all
                        </button>
                      )}
                    </div>
                  </div>
                  {loadingPlaylistRecs ? (
                    <p className="empty-state">Finding similar tracks…</p>
                  ) : playlistRecs.length === 0 ? (
                    <p className="empty-state">No recommendations right now — try Refresh.</p>
                  ) : (
                    <VideoGrid
                      tracks={playlistRecs}
                      onPlay={(track) => handlePlay(track, playlistRecs)}
                      currentVideoId={player.current?.videoId}
                      emptyLabel=""
                      onOpenArtist={handleOpenArtist}
                      {...gridQueueHandlers}
                    />
                  )}
                </section>
              )}
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
          fallback={(reset, error) => (
            <div className="now-playing-overlay now-playing-error" style={{ color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
              <p style={{ fontSize: 16, fontWeight: 600 }}>Now Playing hit a snag.</p>
              <pre style={{ maxWidth: 480, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#f5a8a8', textAlign: 'left' }}>
                {error?.message || 'Unknown error'}
              </pre>
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
            key={player.current.videoId}
            track={player.current}
            queue={player.queue}
            queueIndex={player.queueIndex}
            isPlaying={player.isPlaying}
            currentTime={player.currentTime}
            duration={player.duration}
            apiKey={API_KEY}
            shuffle={player.shuffle}
            repeatMode={player.repeatMode}
            onClose={() => setNowPlayingOpen(false)}
            onToggle={player.togglePlay}
            onNext={player.next}
            onPrev={player.prev}
            onSeek={player.seekTo}
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

      {/* YT replaces a *child* of this host — never put React children inside */}
      <div
        ref={ytContainerRef}
        aria-hidden
        style={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      />
    </div>
  )
}

export default App