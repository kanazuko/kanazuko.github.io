import { useEffect, useRef } from 'react'

const storagePrefix = 'catalog-scroll:'

export function saveScrollPosition(locationKey) {
  sessionStorage.setItem(`${storagePrefix}${locationKey}`, String(window.scrollY))
}

export function useRestoreScrollPosition(locationKey, ready) {
  const restoredKey = useRef(null)

  useEffect(() => {
    if (!ready || restoredKey.current === locationKey) return undefined

    restoredKey.current = locationKey
    const savedPosition = Number(sessionStorage.getItem(`${storagePrefix}${locationKey}`))
    if (!Number.isFinite(savedPosition)) return undefined

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo({ top: savedPosition, behavior: 'instant' }))
    })

    return () => cancelAnimationFrame(frame)
  }, [locationKey, ready])
}
