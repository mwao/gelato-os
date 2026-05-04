import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import {
  profileDowToWeekDayIndex,
  slotIndicesForShiftWindow,
  type ShiftTimeSettings,
} from '@/lib/dateUtils'
import { supabase } from '@/lib/supabase'

export type WeekAssignee = {
  assignee_id: string
  staff_id: string
  staff_name: string
}

export type WeekSlot = {
  id: string
  slot_index: number
  day_index: number
  assignees: WeekAssignee[]
}

function mapSlot(raw: Record<string, unknown>): WeekSlot | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const slot_index = Number(raw.slot_index)
  const day_index = Number(raw.day_index)
  if (!id || Number.isNaN(slot_index) || Number.isNaN(day_index)) return null
  const nested = raw.schedule_week_slot_assignees
  const arr = Array.isArray(nested) ? nested : []
  const assignees: WeekAssignee[] = []
  for (const a of arr) {
    const o = a as Record<string, unknown>
    const aid = typeof o.id === 'string' ? o.id : null
    const sid = typeof o.staff_id === 'string' ? o.staff_id : null
    let staff_name = ''
    const st = o.staff
    if (st && typeof st === 'object' && !Array.isArray(st)) {
      staff_name = String((st as { name?: string }).name ?? '')
    }
    if (aid && sid) assignees.push({ assignee_id: aid, staff_id: sid, staff_name })
  }
  return { id, slot_index, day_index, assignees }
}

export async function fetchWeekSlots(
  storeId: string,
  weekStart: string,
): Promise<WeekSlot[]> {
  const { data, error } = await supabase
    .from('schedule_week_slots')
    .select(
      `
      id,
      slot_index,
      day_index,
      schedule_week_slot_assignees (
        id,
        staff_id,
        staff ( name )
      )
    `,
    )
    .eq('store_id', storeId)
    .eq('week_start', weekStart)

  if (error) throw error
  return (data ?? [])
    .map((r) => mapSlot(r as Record<string, unknown>))
    .filter((x): x is WeekSlot => x !== null)
}

export function useWeekSlots(weekStart: string | undefined) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['weekSchedule', storeId, weekStart],
    enabled: Boolean(storeId && weekStart),
    queryFn: () => fetchWeekSlots(storeId!, weekStart!),
  })
}

async function ensureWeekSlotId(
  storeId: string,
  weekStart: string,
  slotIndex: number,
  dayIndex: number,
): Promise<string> {
  const { data: exist } = await supabase
    .from('schedule_week_slots')
    .select('id')
    .eq('store_id', storeId)
    .eq('week_start', weekStart)
    .eq('slot_index', slotIndex)
    .eq('day_index', dayIndex)
    .maybeSingle()

  if (exist?.id) return String(exist.id)

  const { data: ins, error } = await supabase
    .from('schedule_week_slots')
    .insert({
      store_id: storeId,
      week_start: weekStart,
      slot_index: slotIndex,
      day_index: dayIndex,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(ins!.id)
}

export function useAssignWeekSlot() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      weekStart: string
      slotIndex: number
      dayIndex: number
      staffId: string
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const slotId = await ensureWeekSlotId(
        storeId,
        input.weekStart,
        input.slotIndex,
        input.dayIndex,
      )
      const { error } = await supabase.from('schedule_week_slot_assignees').insert({
        slot_id: slotId,
        staff_id: input.staffId,
      })
      if (error) {
        if (error.code === '23505') return
        throw error
      }
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['weekSchedule', storeId, v.weekStart],
      })
    },
  })
}

export function useRemoveWeekAssignee() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { assigneeId: string; weekStart: string }) => {
      const { error } = await supabase
        .from('schedule_week_slot_assignees')
        .delete()
        .eq('id', input.assigneeId)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['weekSchedule', storeId, v.weekStart],
      })
    },
  })
}

export async function deleteWeekAssigneesForWeek(
  storeId: string,
  weekStart: string,
): Promise<void> {
  const { data: rows, error: qErr } = await supabase
    .from('schedule_week_slots')
    .select('id')
    .eq('store_id', storeId)
    .eq('week_start', weekStart)
  if (qErr) throw qErr
  const ids = (rows ?? []).map((r) => r.id as string)
  if (!ids.length) return
  const { error } = await supabase
    .from('schedule_week_slot_assignees')
    .delete()
    .in('slot_id', ids)
  if (error) throw error
}

/** 초안 맵 key `slotIndex_dayIndex` → staff_id[] → 서버에 덮어쓰기 */
export async function persistWeekDraft(
  storeId: string,
  weekStart: string,
  draft: Record<string, string[]>,
): Promise<void> {
  await deleteWeekAssigneesForWeek(storeId, weekStart)
  for (const [key, staffIds] of Object.entries(draft)) {
    const [si, di] = key.split('_').map(Number)
    if (Number.isNaN(si) || Number.isNaN(di)) continue
    const uniq = [...new Set(staffIds)]
    for (const staffId of uniq) {
      const slotId = await ensureWeekSlotId(storeId, weekStart, si, di)
      const { error } = await supabase.from('schedule_week_slot_assignees').insert({
        slot_id: slotId,
        staff_id: staffId,
      })
      if (error && error.code !== '23505') throw error
    }
  }
}

export function usePersistWeekDraft() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { weekStart: string; draft: Record<string, string[]> }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      await persistWeekDraft(storeId, input.weekStart, input.draft)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['weekSchedule', storeId],
      })
    },
  })
}

export type ProfileStaffRow = {
  id: string
  shifts: { day_of_week: number; shift: 'open' | 'middle' | 'close' }[]
}

/**
 * DB 없이, 직원 프로필 `staff_default_shifts`를 근무관리 시간대 슬롯 키(`slotIndex_dayIndex`)로 풀어
 * `persistWeekDraft`에 넣을 초안 맵을 만든다. «저장» 시에만 서버에 반영.
 */
export function weekDraftFromProfileDefaults(
  staffRows: ProfileStaffRow[],
  settings: ShiftTimeSettings,
): Record<string, string[]> {
  const d: Record<string, string[]> = {}
  for (const s of staffRows) {
    for (const row of s.shifts) {
      const dayIdx = profileDowToWeekDayIndex(row.day_of_week)
      const slotIdxs = slotIndicesForShiftWindow(row.shift, settings)
      for (const slotIndex of slotIdxs) {
        const k = `${slotIndex}_${dayIdx}`
        const arr = [...(d[k] ?? [])]
        if (!arr.includes(s.id)) arr.push(s.id)
        d[k] = arr
      }
    }
  }
  return d
}

/** 초안 맵에서 해당 직원 id만 모든 슬롯에서 제거한다. */
export function stripStaffFromWeekDraft(
  prev: Record<string, string[]>,
  staffId: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [k, ids] of Object.entries(prev)) {
    const filtered = ids.filter((id) => id !== staffId)
    if (filtered.length > 0) next[k] = filtered
  }
  return next
}

/**
 * 해당 직원의 기존 배정만 지운 뒤, 그 직원 프로필 근무요일·시프트만 반영한다.
 * 다른 직원의 칩은 유지한다.
 */
export function mergeWeekDraftWithProfileForStaff(
  prev: Record<string, string[]>,
  staff: ProfileStaffRow,
  settings: ShiftTimeSettings,
): Record<string, string[]> {
  const cleared = stripStaffFromWeekDraft(prev, staff.id)
  const partial = weekDraftFromProfileDefaults([staff], settings)
  const next = { ...cleared }
  for (const [k, ids] of Object.entries(partial)) {
    const arr = [...(next[k] ?? [])]
    for (const id of ids) {
      if (!arr.includes(id)) arr.push(id)
    }
    next[k] = arr
  }
  return next
}
