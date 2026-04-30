import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/auth-context'

import { AuthLoading } from './AuthLoading'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isReady } = useAuth()
  const location = useLocation()

  if (!isReady) {
    return <AuthLoading />
  }

  if (!session?.user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    )
  }

  return <>{children}</>
}
