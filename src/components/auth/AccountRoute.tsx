import { Navigate } from 'react-router-dom'

import { useAuth } from '@/contexts/auth-context'
import { getAccountType, homeRouteFor } from '@/lib/accountType'

import { AuthLoading } from './AuthLoading'

/** 사장님 계정만 진입 허용. 매장 계정은 /store/home 으로. */
export function OwnerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { session, isReady } = useAuth()
  if (!isReady) return <AuthLoading />
  if (!session?.user) return null
  const type = getAccountType(session.user)
  if (type !== 'owner') return <Navigate to={homeRouteFor(type)} replace />
  return <>{children}</>
}

/** 매장 계정만 진입 허용. 사장님은 / 로. */
export function StoreOnlyRoute({ children }: { children: React.ReactNode }) {
  const { session, isReady } = useAuth()
  if (!isReady) return <AuthLoading />
  if (!session?.user) return null
  const type = getAccountType(session.user)
  if (type !== 'store') return <Navigate to={homeRouteFor(type)} replace />
  return <>{children}</>
}
