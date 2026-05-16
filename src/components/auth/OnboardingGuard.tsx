import { Navigate } from 'react-router-dom'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { useStoreList } from '@/hooks/useStore'

/**
 * Owner가 매장 1개 이상 보유한 상태에서만 자식 라우트로 진입 허용.
 * 0개면 /onboarding 으로 리다이렉트.
 */
export function OwnerOnboardingGuard({ children }: { children: React.ReactNode }) {
  const { data: stores, isLoading } = useStoreList()
  if (isLoading) return <AuthLoading />
  if ((stores?.length ?? 0) === 0) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

/**
 * /onboarding 에 stores ≥ 1 인 owner가 접근하면 / 로 차단.
 * 이미 매장이 있는 사장님이 onboarding을 다시 보지 못하도록.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { data: stores, isLoading } = useStoreList()
  if (isLoading) return <AuthLoading />
  if ((stores?.length ?? 0) > 0) return <Navigate to="/" replace />
  return <>{children}</>
}
