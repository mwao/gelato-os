import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

type AuthContextValue = {
  session: Session | null
  isReady: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setIsReady(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo(() => ({ session, isReady }), [session, isReady])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Context consumer; colocated with provider. */
// eslint-disable-next-line react-refresh/only-export-components -- hook paired with AuthProvider
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
