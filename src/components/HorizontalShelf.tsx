import { useRef, useState, useEffect } from 'react'
import './homeExtras.css'

interface HorizontalShelfProps {
  children: React.ReactNode
  className?: string
}

/** Horizontal scroll row with prev/next arrows on the far edges of the row. */
export function HorizontalShelf({ children, className = '' }: HorizontalShelfProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const update = () => {
    const el = scrollerRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 8)
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    update()
    // Re-measure after layout / images
    const t = window.setTimeout(update, 80)
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      window.clearTimeout(t)
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [children])

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.75), behavior: 'smooth' })
  }

  return (
    <div className={`home-shelf-wrap ${className}`}>
      <button
        type="button"
        className="home-shelf-edge-btn home-shelf-edge-prev"
        disabled={!canPrev}
        onClick={() => scrollBy(-1)}
        aria-label="Scroll left"
      >
        ‹
      </button>
      <button
        type="button"
        className="home-shelf-edge-btn home-shelf-edge-next"
        disabled={!canNext}
        onClick={() => scrollBy(1)}
        aria-label="Scroll right"
      >
        ›
      </button>
      <div className="home-album-row" ref={scrollerRef}>
        {children}
      </div>
    </div>
  )
}
