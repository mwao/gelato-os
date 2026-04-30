import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

import { fetchWeekSlots } from '@/hooks/useWeekSchedule'
import {
  addDaysLocal,
  checkoutFromLastSlotLocal,
  dateAtSlotStartLocal,
  parseYmdLocal,
} from '@/lib/dateUtils'

export type AttendanceRow = {
  id: string
  staff_id: string
  staff_name: string
  check_in: string | null
  check_out: string | null
  is_baseline: boolean
  manually_corrected: boolean
}

function mapRow(raw: Record<string, unknown>): AttendanceRow | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const staff_id = typeof raw.staff_id === 'string' ? raw.staff_id : null
  if (!id || !staff_id) return null
  let staff_name = ''
  const st = raw.staff
  if (st && typeof st === 'object' && !Array.isArray(st)) {
    staff_name = String((st as { name?: string }).name ?? '')
  }
  return {
    id,
    staff_id,
    staff_name,
    check_in: raw.check_in == null ? null : String(raw.check_in),
    check_out: raw.check_out == null ? null : String(raw.check_out),
    is_baseline: Boolean(raw.is_baseline),
    manually_corrected: Boolean(raw.manually_corrected),
  }
}

async function fetchAttendance(
  storeId: string,
  opts: { from?: string; to?: string; staffId?: string },
): Promise<AttendanceRow[]> {
  let q = supabase
    .from('attendance')
    .select(
      `
      id, staff_id, check_in, check_out, is_baseline, manually_corrected,
      staff ( name )
    `,
    )
    .eq('store_id', storeId)
    .order('check_in', { ascending: false })
    .limit(200)

  if (opts.staffId) q = q.eq('staff_id', opts.staffId)
  if (opts.from) q = q.gte('check_in', `${opts.from}T00:00:00`)
  if (opts.to) q = q.lt('check_in', `${opts.to}T23:59:59.999Z`)

  const { data, error } = await q
  if (error) throw error
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((x): x is AttendanceRow => x !== null)
}

export function useAttendanceList(filters: {
  from?: string
  to?: string
  staffId?: string
}) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['attendance', storeId, filters],
    enabled: Boolean(storeId),
    queryFn: () => fetchAttendance(storeId!, filters),
  })
}

async function findOpenAttendanceToday(
  storeId: string,
  staffId: string,
): Promise<string | null> {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data } = await supabase
    .from('attendance')
    .select('id, check_out')
    .eq('store_id', storeId)
    .eq('staff_id', staffId)
    .gte('check_in', start.toISOString())
    .lt('check_in', end.toISOString())
    .order('check_in', { ascending: false })

  const rows = data as { id: string; check_out: string | null }[] | null
  const open = rows?.find((r) => r.check_out == null)
  return open?.id ?? null
}

export function usePunchIn() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (staffId: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const openId = await findOpenAttendanceToday(storeId, staffId)
      if (openId) throw new Error('이미 출근 처리된 기록이 있습니다. 퇴근을 먼저 해 주세요.')

      const { error } = await supabase.from('attendance').insert({
        store_id: storeId,
        staff_id: staffId,
        check_in: new Date().toISOString(),
        is_baseline: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance', storeId] })
    },
  })
}

export function usePunchOut() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (staffId: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const openId = await findOpenAttendanceToday(storeId, staffId)
      if (!openId) throw new Error('오늘 미종료 출근 기록이 없습니다.')

      const { error } = await supabase
        .from('attendance')
        .update({ check_out: new Date().toISOString() })
        .eq('id', openId)

      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance', storeId] })
    },
  })
}

/** 주간 근무표: 같은 날·같은 직원의 첫 슬롯~마지막 슬롯 시각으로 기준 출퇴근 행 생성(v1.5 정렬). */
export async function generateAttendanceBaselineForWeek(
  storeId: string,
  weekStart: string,
): Promise<number> {
  const slots = await fetchWeekSlots(storeId, weekStart)
  const weekBase = parseYmdLocal(weekStart)
  weekBase.setHours(0, 0, 0, 0)

  const byStaffDay = new Map<string, number[]>()
  for (const slot of slots) {
    for (const a of slot.assignees) {
      const key = `${a.staff_id}_${slot.day_index}`
      if (!byStaffDay.has(key)) byStaffDay.set(key, [])
      byStaffDay.get(key)!.push(slot.slot_index)
    }
  }

  let created = 0

  for (const [key, indices] of byStaffDay) {
    const underscore = key.lastIndexOf('_')
    const staff_id = key.slice(0, underscore)
    const day_index = Number(key.slice(underscore + 1))
    if (Number.isNaN(day_index)) continue

    const uniq = [...new Set(indices)].sort((x, y) => x - y)
    const minIdx = uniq[0]!
    const maxIdx = uniq[uniq.length - 1]!

    const calendarDay = addDaysLocal(weekBase, day_index)
    const checkIn = dateAtSlotStartLocal(calendarDay, minIdx)
    const checkOut = checkoutFromLastSlotLocal(calendarDay, maxIdx)

    const dayStart = new Date(calendarDay)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('store_id', storeId)
      .eq('staff_id', staff_id)
      .gte('check_in', dayStart.toISOString())
      .lt('check_in', dayEnd.toISOString())
      .maybeSingle()

    if (existing) continue

    const { error } = await supabase.from('attendance').insert({
      store_id: storeId,
      staff_id,
      check_in: checkIn.toISOString(),
      check_out: checkOut.toISOString(),
      is_baseline: true,
    })
    if (error) throw error
    created++
  }

  return created
}

export function useGenerateAttendanceBaseline() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (weekStart: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      return generateAttendanceBaselineForWeek(storeId, weekStart)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance', storeId] })
    },
  })
}
