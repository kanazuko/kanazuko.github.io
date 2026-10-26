import { useEffect, useState } from 'react'

export function useAsyncData(loader) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true)
        setError(null)
      }
    })

    loader()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((loadError) => {
        console.error(loadError)
        if (active) setError(loadError)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [loader])

  return { data, loading, error }
}
