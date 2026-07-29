import { useState } from 'react'
import { SparkleIcon, SendIcon, PlayIcon } from './Icons'
import { VideoGrid } from './VideoGrid'
import type { Track, YouTubeSearchItem } from '../types'

interface FlowProps {
  apiKey: string | undefined
  onPlay: (track: Track, source: Track[]) => void
  currentVideoId?: string | null
}

interface FlowMessage {
  role: 'user' | 'flow'
  text: string
}

const SUGGESTIONS = [
  'Japanese rock',
  'Chill lofi beats for studying',
  '90s hip hop classics',
  'Energetic electronic dance music',
  'Acoustic indie folk',
  'Korean R&B',
  'Classic rock anthems',
  'Dark synthwave',
]

function toTrack(item: YouTubeSearchItem): Track {
  return {
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium.url,
  }
}

/**
 * Generates a set of YouTube search queries from a natural-language prompt.
 * The goal is to produce a diverse, relevant playlist from a single description.
 */
function buildQueries(prompt: string): string[] {
  const clean = prompt.trim()
  const lower = clean.toLowerCase()

  // Detect mood / era / language keywords to enrich queries
  const hasEra = /\b(60s|70s|80s|90s|2000s|2010s|2020s|nineties|eighties|seventies|sixties)\b/.test(lower)
  const hasMood = /\b(chill|happy|sad|energetic|dark|relax|party|workout|focus|study|sleep|romantic)\b/.test(lower)

  const queries = new Set<string>()
  queries.add(clean)

  // Variations that help surface compilations and top tracks
  queries.add(`${clean} playlist`)
  queries.add(`${clean} mix`)
  queries.add(`best ${clean}`)
  queries.add(`${clean} songs`)

  // If the user mentioned a mood but not "mix", add a mix variant
  if (hasMood && !lower.includes('mix')) {
    queries.add(`${clean} mix`)
  }

  // If era detected, add "classics" / "hits" variants
  if (hasEra) {
    queries.add(`${clean} classics`)
    queries.add(`${clean} hits`)
  }

  // Always include a "top tracks" variant for breadth
  queries.add(`top ${clean} tracks`)

  return Array.from(queries).slice(0, 6)
}

export function Flow({ apiKey, onPlay, currentVideoId }: FlowProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<FlowMessage[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (prompt: string) => {
    if (!prompt.trim()) return
    if (!apiKey) {
      setError('No YouTube API key found. Add VITE_YOUTUBE_API_KEY to your .env file.')
      return
    }

    setLoading(true)
    setError(null)
    setMessages((m) => [
      ...m,
      { role: 'user', text: prompt },
      { role: 'flow', text: `Building a playlist for "${prompt}"…` },
    ])

    try {
      const queries = buildQueries(prompt)
      const results: Track[] = []
      const seen = new Set<string>()

      // Run searches in parallel
      const responses = await Promise.all(
        queries.map((q) =>
          fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
              q
            )}&type=video&maxResults=8&videoEmbeddable=true&key=${apiKey}`
          ).then((r) => r.json())
        )
      )

      for (const data of responses) {
        for (const item of data.items || []) {
          if (!item.id?.videoId) continue
          if (seen.has(item.id.videoId)) continue
          seen.add(item.id.videoId)
          results.push(toTrack(item))
        }
      }

      // Shuffle the combined results so the playlist feels fresh
      for (let i = results.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[results[i], results[j]] = [results[j], results[i]]
      }

      const playlist = results.slice(0, 20)
      setTracks(playlist)

      setMessages((m) => [
        ...m,
        {
          role: 'flow',
          text:
            playlist.length > 0
              ? `Done! I found ${playlist.length} tracks that match "${prompt}". Press play to start listening.`
              : `I couldn't find any tracks for that. Try a different description.`,
        },
      ])
    } catch (err) {
      console.error('Flow generation failed:', err)
      setError('Flow failed to generate a playlist. Check your API key and quota.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    const prompt = input
    setInput('')
    generate(prompt)
  }

  const handleSuggestion = (s: string) => {
    if (loading) return
    setInput('')
    generate(s)
  }

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      onPlay(tracks[0], tracks)
    }
  }

  return (
    <div className="flow-container">
      <section className="flow-hero">
        <div className="flow-hero-icon">
          <SparkleIcon size={28} />
        </div>
        <h1 className="flow-title">
          <span className="accent-text">Flow</span>
        </h1>
        <p className="flow-subtitle">
          Describe a vibe, genre, mood, or era — Flow builds a playlist for you.
        </p>
      </section>

      <form className="flow-input-row" onSubmit={handleSubmit}>
        <div className="flow-input-box">
          <SparkleIcon size={18} className="flow-input-icon" />
          <input
            type="text"
            className="flow-input"
            placeholder="e.g. Japanese rock, chill lofi for studying, 90s hip hop…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="accent-fill flow-send-button"
          disabled={loading || !input.trim()}
          aria-label="Generate playlist"
        >
          {loading ? <span className="flow-spinner" /> : <SendIcon size={18} />}
        </button>
      </form>

      {messages.length === 0 && (
        <div className="flow-suggestions">
          <p className="flow-suggestions-label">Try one of these:</p>
          <div className="flow-chip-row">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="flow-chip"
                onClick={() => handleSuggestion(s)}
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="flow-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`flow-message flow-message-${msg.role}`}>
              {msg.role === 'flow' && <SparkleIcon size={14} className="flow-message-icon" />}
              <span>{msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}

      {tracks.length > 0 && (
        <div className="flow-results">
          <div className="flow-results-header">
            <h2 className="section-heading">Flow playlist</h2>
            <button className="accent-fill flow-play-all-button" onClick={handlePlayAll}>
              <PlayIcon size={14} />
              <span>Play all</span>
            </button>
          </div>
          <VideoGrid
            tracks={tracks}
            onPlay={(track) => onPlay(track, tracks)}
            currentVideoId={currentVideoId}
            emptyLabel="No tracks generated yet."
          />
        </div>
      )}

      {loading && tracks.length === 0 && (
        <div className="flow-loading">
          <div className="flow-loading-dots">
            <span />
            <span />
            <span />
          </div>
          <p>Searching for the perfect tracks…</p>
        </div>
      )}
    </div>
  )
}