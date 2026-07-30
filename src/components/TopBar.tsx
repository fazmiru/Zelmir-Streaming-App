import { SearchIcon } from './Icons'

interface TopBarProps {
  query: string
  onQueryChange: (v: string) => void
  onSearch: () => void
  loading: boolean
}

export function TopBar({ query, onQueryChange, onSearch, loading }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="search-box">
        <SearchIcon className="search-box-icon" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="Search songs, artists, albums..."
        />
      </div>
      <button className="accent-fill search-button" onClick={onSearch} disabled={loading}>
        {loading ? 'Searching…' : 'Search'}
      </button>
    </header>
  )
}
