import React, { useRef, useState, useCallback, useMemo } from 'react'
import type { Track } from '../types'

interface VirtualScrollProps {
  items: Track[]
  itemHeight: number
  containerHeight: number
  renderItem: (item: Track, index: number) => React.ReactNode
  onScroll?: (scrollTop: number) => void
  className?: string
}

export function VirtualScroll({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  onScroll,
  className = '',
}: VirtualScrollProps) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 1)
  const endIndex = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + 1)

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  )

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const top = (e.target as HTMLDivElement).scrollTop
      setScrollTop(top)
      onScroll?.(top)
    },
    [onScroll]
  )

  const offsetY = startIndex * itemHeight

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, idx) => (
            <div key={item.videoId} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + idx)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
