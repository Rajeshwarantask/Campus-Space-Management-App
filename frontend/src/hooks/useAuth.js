import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setSession(error ? null : data.session)
        setLoading(false)
      }
    }).catch(() => {
      if (active) {
        setSession(null)
        setLoading(false)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return { session, loading, signOut: () => supabase.auth.signOut() }
}
