import { useEffect, useRef, useState } from 'react'

export function useLazyLoadImage(src: string | undefined, placeholder = '/api/placeholder') {
  const [imageSrc, setImageSrc] = useState(placeholder)
  const [isLoaded, setIsLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!src) {
      setImageSrc(placeholder)
      return
    }

    // Use IntersectionObserver to lazy load images
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const img = new Image()
          img.onload = () => {
            setImageSrc(src)
            setIsLoaded(true)
          }
          img.onerror = () => {
            setImageSrc(placeholder)
          }
          img.src = src
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '50px' }
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current)
      }
    }
  }, [src, placeholder])

  return { imageSrc, isLoaded, imgRef }
}
