import { Navigate } from 'react-router-dom'

import { useAuth } from '@/contexts/auth-context'

import { AuthLoading } from './AuthLoading'

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const { session, isReady } = useAuth()

  if (!isReady) {
    return <AuthLoading />
  }

  if (session?.user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
