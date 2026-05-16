import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ShiftCode } from '@/hooks/useStaff'
import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type StaffShiftOverrideRow = {
  id: string
  store_id: string
  staff_id: string
  shift: ShiftCode
  start_time: string // HH:MM
  end_time: string // HH:MM
}

function mapRow(raw: Record<string, unknown>): StaffShiftOverrideRow | null {
  const shift = raw.shift
  if (shift !== 'open' && shift !== 'middle' && shift !== 'close') return null
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    staff_id: String(raw.staff_id),
    shift,
    start_time: String(raw.start_time),
    end_time: String(raw.end_time),
  }
}

const HM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

function assertHm(value: string, field: string) {
  if (!HM_REGEX.test(value)) {
    throw new Error(`${field} 형식이 올바르지 않습니다 (HH:MM): ${value}`)
  }
}

async function fetchOverrides(
  storeId: string,
  staffId?: string,
): Promise<StaffShiftOverrideRow[]> {
  let query = supabase
    .from('staff_shift_overrides')
    .select('id, store_id, staff_id, shift, start_time, end_time')
    .eq('store_id', storeId)
  if (staffId) query = query.eq('staff_id', staffId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((x): x is StaffShiftOverrideRow => x !== null)
}

/** 매장 전체 오버라이드 — `getShiftTimeForStaff` 헬퍼에 통째로 전달용 */
export function useStaffShiftOverrides() {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['staffShiftOverrides', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchOverrides(storeId!),
    staleTime: 60_000,
  })
}

/** 특정 직원의 오버라이드 — 프로필 폼에서 사용 */
export function useStaffShiftOverridesFor(staffId: string | undefined) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['staffShiftOverrides', storeId, staffId],
    enabled: Boolean(storeId && staffId),
    queryFn: () => fetchOverrides(storeId!, staffId!),
    staleTime: 60_000,
  })
}

export type UpsertStaffShiftOverrideInput = {
  staff_id: string
  shift: ShiftCode
  start_time: string // HH:MM
  end_time: string // HH:MM
}

/** (staff_id, shift) UNIQUE 기준 UPSERT */
export function useUpsertStaffShiftOverride() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: UpsertStaffShiftOverrideInput) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      assertHm(input.start_time, 'start_time')
      assertHm(input.end_time, 'end_time')
      if (input.end_time <= input.start_time) {
        throw new Error('종료 시각이 시작 시각보다 빨라요.')
      }

      const { data, error } = await supabase
        .from('staff_shift_overrides')
        .upsert(
          {
            store_id: storeId,
            staff_id: input.staff_id,
            shift: input.shift,
            start_time: input.start_time,
            end_time: input.end_time,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id,shift' },
        )
        .select('id, store_id, staff_id, shift, start_time, end_time')
        .single()

      if (error) throw error
      const mapped = mapRow(data as Record<string, unknown>)
      if (!mapped) throw new Error('upsert 응답을 해석할 수 없습니다.')
      return mapped
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({ queryKey: ['staffShiftOverrides', storeId] })
      void queryClient.invalidateQueries({
        queryKey: ['staffShiftOverrides', storeId, v.staff_id],
      })
    },
  })
}

/** (staff_id, shift) 행 1개 삭제 — «매장기본 사용»으로 되돌릴 때 */
export function useDeleteStaffShiftOverride() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { staff_id: string; shift: ShiftCode }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('staff_shift_overrides')
        .delete()
        .eq('store_id', storeId)
        .eq('staff_id', input.staff_id)
        .eq('shift', input.shift)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({ queryKey: ['staffShiftOverrides', storeId] })
      void queryClient.invalidateQueries({
        queryKey: ['staffShiftOverrides', storeId, v.staff_id],
      })
    },
  })
}
