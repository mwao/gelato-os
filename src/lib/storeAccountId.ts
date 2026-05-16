/**
 * 매장 계정 — 「이메일」 대신 「매장 ID」 UX.
 *
 * 사장님과 직원은 "gangnam" 같은 매장 ID만 보고/입력하지만,
 * 내부적으로는 `${매장ID}@${SYNTHETIC_EMAIL_DOMAIN}` 형식의 합성 이메일로
 * Supabase Auth에 저장된다. Supabase는 이메일 형식만 검증하고 메일은 발송 안 함
 * (Edge Function에서 `email_confirm: true`로 우회).
 *
 * 글로벌 unique 제약은 Supabase의 email unique constraint를 그대로 활용.
 */

export const SYNTHETIC_EMAIL_DOMAIN = 'store.gelato.local'

/** 매장 ID 유효성 패턴 — 4~20자, 영문 소문자 + 숫자 + 언더바·하이픈 */
const STORE_ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{3,19}$/

/** 매장 ID → 합성 이메일 */
export function storeIdToEmail(accountId: string): string {
  return `${accountId.trim().toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`
}

/**
 * 합성 이메일 → 매장 ID (UI 표시용).
 * 합성 도메인이 아니면 (legacy 실제 이메일) 그대로 반환.
 */
export function emailToDisplayId(email: string | null | undefined): string {
  if (!email) return ''
  if (email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)) {
    return email.split('@')[0]
  }
  return email
}

/** 로그인 시 — @ 포함이면 그대로 (legacy 호환), 없으면 합성 적용 */
export function loginInputToEmail(input: string): string {
  const v = input.trim()
  if (v.includes('@')) return v.toLowerCase()
  return storeIdToEmail(v)
}

/** 매장 ID 형식 검증 — 잘못되면 사람용 에러 메시지, OK면 null */
export function validateStoreAccountId(accountId: string): string | null {
  const v = accountId.trim()
  if (!v) return '매장 ID를 입력해 주세요.'
  if (v.length < 4) return '매장 ID는 4자 이상이어야 합니다.'
  if (v.length > 20) return '매장 ID는 20자 이하여야 합니다.'
  if (!STORE_ACCOUNT_ID_RE.test(v.toLowerCase()))
    return '매장 ID는 영문 소문자·숫자·언더바(_)·하이픈(-) 만 사용할 수 있고, 첫 글자는 영문·숫자입니다.'
  return null
}
