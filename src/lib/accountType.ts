import type { User } from '@supabase/supabase-js'

export type AccountType = 'owner' | 'store'

/**
 * 사용자의 계정 종류 판정.
 * - `user.app_metadata.account_type === 'store'` → 매장 계정
 * - 그 외 (undefined 포함) → 사장님 계정 (디폴트)
 *
 * `app_metadata`는 서버(Edge Function 또는 admin API)에서만 설정 가능하므로
 * 신뢰할 수 있음. 자가 신규 가입은 미설정 → 자연스럽게 owner 처리.
 * 매장 계정은 Phase 5의 Edge Function이 명시적으로 'store' 부여.
 */
export function getAccountType(user: User | null | undefined): AccountType {
  const t = user?.app_metadata?.account_type
  return t === 'store' ? 'store' : 'owner'
}

/** 계정 종류별 첫 진입 라우트 */
export function homeRouteFor(type: AccountType): string {
  return type === 'store' ? '/store/home' : '/'
}

/** 한글 라벨 */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  owner: '사장님',
  store: '매장',
}
