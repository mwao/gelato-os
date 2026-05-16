import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type PayMode = 'hourly' | 'salary'

export type EmploymentTypeRow = {
  id: string
  store_id: string
  code: string
  label: string
  pay_mode: PayMode
  monthly_off_days: number | null
}

function mapRow(raw: Record<string, unknown>): EmploymentTypeRow {
  const payMode = raw.pay_mode === 'salary' ? 'salary' : 'hourly'
  const off = raw.monthly_off_days
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    code: String(raw.code),
    label: String(raw.label),
    pay_mode: payMode,
    monthly_off_days:
      off === null || off === undefined ? null : Number(off),
  }
}

export type EmploymentSeed = {
  code: string
  label: string
  pay_mode: PayMode
  monthly_off_days: number | null
}

/** UI·시드 공통: 매니저 → 직원 → 아르바이트 → 기타 */
export const DEFAULT_EMPLOYMENT_SEEDS: readonly EmploymentSeed[] = [
  { code: 'manager', label: '매니저', pay_mode: 'salary', monthly_off_days: 8 },
  { code: 'staff', label: '직원', pay_mode: 'salary', monthly_off_days: 8 },
  { code: 'parttime', label: '아르바이트', pay_mode: 'hourly', monthly_off_days: null },
  { code: 'other', label: '기타', pay_mode: 'hourly', monthly_off_days: null },
]

const ORDER_FOR_SORT = ['manager', 'staff', 'parttime', 'other'] as const

/** 고용형태 셀렉트: 기본 4종 순서 고정, 그 외 커스텀은 이름순 뒤로 */
export function sortEmploymentTypesForSelect(types: EmploymentTypeRow[]): EmploymentTypeRow[] {
  return [...types].sort((a, b) => {
    const ia = ORDER_FOR_SORT.indexOf(a.code as (typeof ORDER_FOR_SORT)[number])
    const ib = ORDER_FOR_SORT.indexOf(b.code as (typeof ORDER_FOR_SORT)[number])
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    }
    return a.label.localeCompare(b.label, 'ko')
  })
}

async function fetchTypes(storeId: string): Promise<EmploymentTypeRow[]> {
  const { data, error } = await supabase
    .from('employment_types')
    .select('id, store_id, code, label, pay_mode, monthly_off_days')
    .eq('store_id', storeId)
    .order('code')

  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export function useEmploymentTypes() {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['employmentTypes', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchTypes(storeId!),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * 매장 기본 고용형태 4종 보장:
 * 1. 빠진 코드(`manager` 등) INSERT
 * 2. 기존 시드 코드 중 마이그레이션 기본값(`pay_mode='hourly' AND monthly_off_days IS NULL`)
 *    인 채로 남은 행을 시드와 다르면 UPDATE — `feature5_pay_mode.sql` 백필 직후 1회 정상화용.
 *    사용자가 수동으로 다른 값을 넣어두었으면 건드리지 않음.
 */
export function useEnsureDefaultEmploymentTypes() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (): Promise<{ didChange: boolean }> => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const existing = await fetchTypes(storeId)
      const byCode = new Map(existing.map((e) => [e.code, e]))

      const toInsert = DEFAULT_EMPLOYMENT_SEEDS.filter((s) => !byCode.has(s.code))
      const toBackfill = DEFAULT_EMPLOYMENT_SEEDS.filter((s) => {
        const ex = byCode.get(s.code)
        if (!ex) return false
        if (ex.pay_mode === s.pay_mode && ex.monthly_off_days === s.monthly_off_days) return false
        // 마이그레이션 백필 직후 상태(default 'hourly' + null)만 대상으로
        return ex.pay_mode === 'hourly' && ex.monthly_off_days === null
      })

      if (toInsert.length === 0 && toBackfill.length === 0) {
        return { didChange: false }
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('employment_types').insert(
          toInsert.map((s) => ({
            store_id: storeId,
            code: s.code,
            label: s.label,
            pay_mode: s.pay_mode,
            monthly_off_days: s.monthly_off_days,
          })),
        )
        if (error) throw error
      }

      for (const s of toBackfill) {
        const ex = byCode.get(s.code)!
        const { error } = await supabase
          .from('employment_types')
          .update({ pay_mode: s.pay_mode, monthly_off_days: s.monthly_off_days })
          .eq('id', ex.id)
          .eq('store_id', storeId)
        if (error) throw error
      }

      return { didChange: true }
    },
    onSuccess: (result) => {
      if (result.didChange) {
        void queryClient.invalidateQueries({ queryKey: ['employmentTypes', storeId] })
      }
    },
  })
}

export function useCreateEmploymentType() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      code: string
      label: string
      pay_mode?: PayMode
      monthly_off_days?: number | null
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const code = input.code.trim().toLowerCase().replace(/\s+/g, '_')
      const label = input.label.trim()
      if (!code || !label) throw new Error('코드와 이름을 입력해 주세요.')
      const payMode: PayMode = input.pay_mode ?? 'hourly'

      const { data, error } = await supabase
        .from('employment_types')
        .insert({
          store_id: storeId,
          code,
          label,
          pay_mode: payMode,
          monthly_off_days:
            payMode === 'salary' ? (input.monthly_off_days ?? 8) : null,
        })
        .select('id, store_id, code, label, pay_mode, monthly_off_days')
        .single()

      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employmentTypes', storeId] })
    },
  })
}
