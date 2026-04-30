import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type EmploymentTypeRow = {
  id: string
  store_id: string
  code: string
  label: string
}

function mapRow(raw: Record<string, unknown>): EmploymentTypeRow {
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    code: String(raw.code),
    label: String(raw.label),
  }
}

/** UI·시드 공통: 매니저 → 직원 → 아르바이트 → 기타 */
export const DEFAULT_EMPLOYMENT_SEEDS: readonly { code: string; label: string }[] = [
  { code: 'manager', label: '매니저' },
  { code: 'staff', label: '직원' },
  { code: 'parttime', label: '아르바이트' },
  { code: 'other', label: '기타' },
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
    .select('id, store_id, code, label')
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

/** 매장에 기본 고용형태 4종(매니저·직원·아르바이트·기타)이 빠져 있으면 채웁니다. */
export function useEnsureDefaultEmploymentTypes() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (): Promise<{ didInsert: boolean }> => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const existing = await fetchTypes(storeId)
      const have = new Set(existing.map((e) => e.code))
      const toInsert = DEFAULT_EMPLOYMENT_SEEDS.filter((s) => !have.has(s.code))
      if (toInsert.length === 0) {
        return { didInsert: false }
      }

      const { error } = await supabase.from('employment_types').insert(
        toInsert.map((s) => ({
          store_id: storeId,
          code: s.code,
          label: s.label,
        })),
      )

      if (error) throw error
      return { didInsert: true }
    },
    onSuccess: (result) => {
      if (result.didInsert) {
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
    mutationFn: async (input: { code: string; label: string }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const code = input.code.trim().toLowerCase().replace(/\s+/g, '_')
      const label = input.label.trim()
      if (!code || !label) throw new Error('코드와 이름을 입력해 주세요.')

      const { data, error } = await supabase
        .from('employment_types')
        .insert({
          store_id: storeId,
          code,
          label,
        })
        .select('id, store_id, code, label')
        .single()

      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employmentTypes', storeId] })
    },
  })
}
