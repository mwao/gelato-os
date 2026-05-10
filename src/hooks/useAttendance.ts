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

function ymdToLocalIsoStart(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).toISOString()
}

function ymdToLocalIsoEnd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
  end.setDate(end.getDate() + 1)
  return end.toISOString()
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
      staff:staff_id ( name )
    `,
    )
    .eq('store_id', storeId)
    .order('check_in', { ascending: false, nullsFirst: false })
    .limit(500)

  if (opts.staffId) q = q.eq('staff_id', opts.staffId)
  if (opts.from) q = q.gte('check_in', ymdToLocalIsoStart(opts.from))
  if (opts.to) q = q.lt('check_in', ymdToLocalIsoEnd(opts.to))

  const { data, error } = await q
  if (error) {
    console.error('[fetchAttendance] error', error, { storeId, opts })
    throw error
  }
  if (import.meta.env.DEV) {
    console.debug('[fetchAttendance] rows', {
      storeId,
      opts,
      count: data?.length ?? 0,
      sample: (data ?? []).slice(0, 3),
    })
  }
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
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
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
    .eq('is_baseline', false)
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    },
  })
}

export function useCorrectAttendance() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async ({
      attendanceId,
      checkIn,
      checkOut,
      correctionNote,
    }: {
      attendanceId: string
      checkIn: string | null
      checkOut: string | null
      correctionNote?: string
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('attendance')
        .update({
          check_in: checkIn,
          check_out: checkOut,
          manually_corrected: true,
          correction_note: correctionNote ?? null,
        })
        .eq('id', attendanceId)
        .eq('store_id', storeId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    },
  })
}

type AttendanceDayRow = {
  id: string
  is_baseline: boolean
  manually_corrected: boolean
  check_in: string | null
  check_out: string | null
}

function mapAttendanceDayRows(
  raw: Record<string, unknown>[] | null | undefined,
): AttendanceDayRow[] {
  const out: AttendanceDayRow[] = []
  for (const r of raw ?? []) {
    const id = typeof r.id === 'string' ? r.id : null
    if (!id) continue
    out.push({
      id,
      is_baseline: Boolean(r.is_baseline),
      manually_corrected: Boolean(r.manually_corrected),
      check_in: r.check_in == null ? null : String(r.check_in),
      check_out: r.check_out == null ? null : String(r.check_out),
    })
  }
  return out
}

/** `generateAttendanceBaselineForWeek` 결과 — 알림·로그용 (신규만 세던 숫자의 함정 방지). */
export type GenerateBaselineSummary = {
  /** 슬롯에서 집계된 직원×일 단위 수 */
  plannedStaffDays: number
  inserted: number
  /** 자동 기준이었던 행을 새 첫·마지막 슬롯 시각으로 맞춤(또는 중복 baseline 정리) */
  updated: number
  /** 실제 출근 행·수기 수정분이 있어 건드리지 않은 직원×일 */
  skippedConflict: number
  /** 자동 기준 1건이 이미 같은 예정 시각 */
  unchanged: number
}

/** 저장 직후 알림에 넣을 한 줄 요약(한국어). */
export function describeBaselineSyncSummary(s: GenerateBaselineSummary): string {
  if (s.plannedStaffDays === 0) {
    return '이번 주 슬롯 배정이 없어 출퇴근 기준(예정)을 생성·수정하지 않았습니다.'
  }
  const parts: string[] = []
  if (s.inserted) parts.push(`신규 생성 ${s.inserted}건`)
  if (s.updated) parts.push(`일정에 맞게 수정 ${s.updated}건`)
  if (s.unchanged) parts.push(`이미 예정과 동일 ${s.unchanged}건`)
  if (s.skippedConflict)
    parts.push(`실제 출근·수정 기록 있어 유지 ${s.skippedConflict}건`)
  if (parts.length === 0) {
    return `출퇴근 기준 동기화 집계: 직원·일 ${s.plannedStaffDays}건 처리됨.`
  }
  return `출퇴근 기준 자동 동기화: ${parts.join(' · ')}.`
}

/** 주간 근무표: 같은 날·같은 직원의 첫 슬롯~마지막 슬롯 시각으로 기준 출퇴근 행 생성·맞춤(v1.5 정렬). */
export async function generateAttendanceBaselineForWeek(
  storeId: string,
  weekStart: string,
): Promise<GenerateBaselineSummary> {
  const slots = await fetchWeekSlots(storeId, weekStart)
  const weekBase = parseYmdLocal(weekStart)
  weekBase.setHours(0, 0, 0, 0)

  const byStaffDay = new Map<string, number[]>()
  for (const slot of slots) {
    for (const a of slot.assignees) {
      const key = `${a.staff_id}|${slot.day_index}`
      if (!byStaffDay.has(key)) byStaffDay.set(key, [])
      byStaffDay.get(key)!.push(slot.slot_index)
    }
  }

  const summary: GenerateBaselineSummary = {
    plannedStaffDays: byStaffDay.size,
    inserted: 0,
    updated: 0,
    skippedConflict: 0,
    unchanged: 0,
  }

  for (const [key, indices] of byStaffDay) {
    const pipe = key.indexOf('|')
    if (pipe < 0) continue
    const staff_id = key.slice(0, pipe)
    const day_index = Number(key.slice(pipe + 1))
    if (Number.isNaN(day_index)) continue

    const uniq = [...new Set(indices)].sort((x, y) => x - y)
    const minIdx = uniq[0]!
    const maxIdx = uniq[uniq.length - 1]!

    const calendarDay = addDaysLocal(weekBase, day_index)
    const checkIn = dateAtSlotStartLocal(calendarDay, minIdx)
    const checkOut = checkoutFromLastSlotLocal(calendarDay, maxIdx)
    const targetIn = checkIn.toISOString()
    const targetOut = checkOut.toISOString()

    const dayStart = new Date(calendarDay)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const dayStartIso = dayStart.toISOString()
    const dayEndIso = dayEnd.toISOString()

    const { data: rows, error: qErr } = await supabase
      .from('attendance')
      .select('id, is_baseline, manually_corrected, check_in, check_out')
      .eq('store_id', storeId)
      .eq('staff_id', staff_id)
      .gte('check_in', dayStartIso)
      .lt('check_in', dayEndIso)
    if (qErr) throw qErr

    const list = mapAttendanceDayRows(rows as Record<string, unknown>[] | null)

    if (list.length === 0) {
      const { error } = await supabase.from('attendance').insert({
        store_id: storeId,
        staff_id,
        check_in: targetIn,
        check_out: targetOut,
        is_baseline: true,
      })
      if (error) throw error
      summary.inserted++
      continue
    }

    const hasConflict = list.some(
      (r) => !r.is_baseline || r.manually_corrected,
    )
    if (hasConflict) {
      summary.skippedConflict++
      continue
    }

    const baselineRows = list.filter((r) => r.is_baseline && !r.manually_corrected)
    if (baselineRows.length === 0) {
      summary.skippedConflict++
      continue
    }

    baselineRows.sort((a, b) =>
      String(a.check_in ?? '').localeCompare(String(b.check_in ?? '')),
    )
    const keeper = baselineRows[0]!
    const duplicateIds = baselineRows.slice(1).map((r) => r.id)

    const sameTime =
      keeper.check_in === targetIn &&
      keeper.check_out === targetOut &&
      duplicateIds.length === 0

    if (sameTime) {
      summary.unchanged++
      continue
    }

    const { error: upErr } = await supabase
      .from('attendance')
      .update({
        check_in: targetIn,
        check_out: targetOut,
        is_baseline: true,
      })
      .eq('id', keeper.id)
      .eq('store_id', storeId)
    if (upErr) throw upErr

    if (duplicateIds.length > 0) {
      const { error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('store_id', storeId)
        .in('id', duplicateIds)
      if (delErr) throw delErr
    }

    summary.updated++
  }

  return summary
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (attendanceId: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', attendanceId)
        .eq('store_id', storeId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    },
  })
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
      void queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    },
  })
}
