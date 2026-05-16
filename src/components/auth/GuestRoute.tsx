import { Navigate } from 'react-router-dom'

import { useAuth } from '@/contexts/auth-context'
import { getAccountType, homeRouteFor } from '@/lib/accountType'

import { AuthLoading } from './AuthLoading'

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, isReady } = useAuth()

  if (!isReady) {
    return <AuthLoading />
  }

  if (session?.user) {
    return <Navigate to={homeRouteFor(getAccountType(session.user))} replace />
  }

  return <>{children}</>
}
