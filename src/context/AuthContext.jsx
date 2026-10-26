import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isCurrentUserAdmin } from '../services/authService'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authorizationStatus, setAuthorizationStatus] = useState('checking')
  const [authorizationError, setAuthorizationError] = useState(null)
  const [verifiedUserId, setVerifiedUserId] = useState(null)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!active) return

      if (error) {
        console.error('No se pudo restaurar la sesión', error)
        setSession(null)
      } else {
        setSession(data.session)
      }
      setSessionLoading(false)
    }

    restoreSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setSessionLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    const userId = session?.user?.id

    if (!userId) {
      Promise.resolve().then(() => {
        if (!active) return
        setAuthorizationStatus('anonymous')
        setAuthorizationError(null)
        setVerifiedUserId(null)
      })
      return () => {
        active = false
      }
    }

    Promise.resolve().then(() => {
      if (!active) return
      setAuthorizationStatus('checking')
      setAuthorizationError(null)
    })

    isCurrentUserAdmin(userId)
      .then((authorized) => {
        if (!active) return
        setAuthorizationStatus(authorized ? 'admin' : 'denied')
        setVerifiedUserId(userId)
      })
      .catch((error) => {
        console.error('No se pudo verificar el rol administrativo', error)
        if (!active) return
        setAuthorizationStatus('error')
        setAuthorizationError(error)
        setVerifiedUserId(userId)
      })

    return () => {
      active = false
    }
  }, [session])

  const user = session?.user ?? null
  const loading =
    sessionLoading ||
    authorizationStatus === 'checking' ||
    Boolean(user && verifiedUserId !== user.id)

  const value = useMemo(
    () => ({
      session,
      user,
      isAdmin: authorizationStatus === 'admin',
      authorizationStatus,
      authorizationError,
      loading,
    }),
    [session, user, authorizationStatus, authorizationError, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
