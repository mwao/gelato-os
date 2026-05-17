import { supabase } from '@/lib/supabase'

export type StoreRow = {
  id: string
  name: string
  owner_id: string
  shift_open_start: string | null
  shift_open_end: string | null
  shift_middle_start: string | null
  shift_middle_end: string | null
  shift_close_start: string | null
  shift_close_end: string | null
  /** 사업자등록번호 — 명세서·세금계산서 헤더 */
  business_no: string | null
  /** 대표자명 */
  owner_name: string | null
  /** 매장 주소 */
  address: string | null
  /** 매장 연락처 */
  phone: string | null
  /** 매장 계정 (Auth user.id) — 발급 안 됐으면 null */
  store_account_user_id: string | null
  /** 매장 계정 이메일 (denormalize — UI 표시용) */
  store_account_email: string | null
}

const STORE_SELECT_COLUMNS =
  'id, name, owner_id, shift_open_start, shift_open_end, shift_middle_start, shift_middle_end, shift_close_start, shift_close_end, business_no, owner_name, address, phone, store_account_user_id, store_account_email'

export const DEFAULT_STORE_NAME = '내 매장'

/**
 * v1.5 변경: 자동 매장 생성 제거. SELECT 만 수행하고 매장이 없으면 throw.
 * 매장이 없는 상태(=신규 가입 직후)는 Onboarding 페이지에서 처리하며,
 * 매장이 반드시 있어야 하는 mutation 등에서만 이 함수를 호출한다.
 */
export async function ensureStore(_ownerId: string): Promise<StoreRow> {
  const store = await fetchPrimaryStore()
  if (!store) {
    throw new Error(
      '매장이 등록되지 않았습니다. 「내 매장 정보」에서 매장을 먼저 추가해 주세요.',
    )
  }
  return store
}

/**
 * v1.5: 현재 사용자의 「대표 매장」 1건 (없으면 null). useStore의 queryFn에서 사용.
 * Owner: 본인 보유 매장 중 가장 오래된 1개.
 * Store account: 본인 매장 1개 (매장당 1:1).
 * RLS가 자동으로 (owner_id = auth.uid() OR store_account_user_id = auth.uid()) 매장만 노출 →
 * 추가 명시 필터 불필요.
 */
export async function fetchPrimaryStore(): Promise<StoreRow | null> {
  const { data, error } = await supabase
    .from('stores')
    .select(STORE_SELECT_COLUMNS)
    .order('created_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as StoreRow | null) ?? null
}

/**
 * v1.5: 현재 사용자의 접근 가능 매장 전체. useStoreList의 queryFn에서 사용.
 * Owner: 본인 보유 매장 전체.
 * Store account: 본인 매장 1건.
 * RLS가 (owner_id=auth.uid() OR store_account_user_id=auth.uid()) 필터를 자동 적용.
 */
export async function fetchStoresForOwner(): Promise<StoreRow[]> {
  const { data, error } = await supabase
    .from('stores')
    .select(STORE_SELECT_COLUMNS)
    .order('created_at', { ascending: true, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as StoreRow[]
}

export type CreateStoreInput = {
  name: string
  business_no?: string | null
  owner_name?: string | null
  address?: string | null
  phone?: string | null
}

/** v1.5: 신규 매장 추가. Onboarding + 「+ 매장 추가」 모달 공용. */
export async function createStoreForOwner(
  ownerId: string,
  input: CreateStoreInput,
): Promise<StoreRow> {
  const { data, error } = await supabase
    .from('stores')
    .insert({
      owner_id: ownerId,
      name: input.name,
      business_no: input.business_no ?? null,
      owner_name: input.owner_name ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
    })
    .select(STORE_SELECT_COLUMNS)
    .single()

  if (error) throw error
  return data as StoreRow
}
