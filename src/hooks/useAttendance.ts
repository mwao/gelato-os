import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

import { parseYmdLocal } from '@/lib/dateUtils'
import {
  getShiftTimeForDay,
  type StoreShiftColumns,
} from '@/lib/shiftResolver'
import { ensureStore } from '@/lib/ensureStore'
import { useAuth } from '@/contexts/auth-context'

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

function dateAtHmLocal(baseDay: Date, hm: string): Date {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10))
  const d = new Date(baseDay)
  d.setHours(Number.isNaN(h) ? 9 : h, Number.isNaN(m) ? 0 : m, 0, 0)
  return d
}

/**
 * v1.5 A안: 월간 근무표(`schedule_month_cells`) 기반 baseline 생성·맞춤.
 * 각 cell에 대해 `getShiftTimeForDay` (cell.start_time/end_time > staff override > store)로 시각 결정.
 *
 * cells에 없는 (staff, date)의 기존 자동 baseline은 휴무 의미이므로 DELETE.
 * 단 `manually_corrected=true`거나 실제 punch(`is_baseline=false`)는 유지.
 */
export async function generateAttendanceBaselineForMonth(
  storeId: string,
  ym: string,
  store: StoreShiftColumns,
): Promise<GenerateBaselineSummary> {
  // 1. 해당 월 cells 조회 (start_time/end_time 포함)
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) throw new Error(`잘못된 ym: ${ym}`)
  const last = new Date(y, m, 0).getDate()
  const monthStartIso = new Date(y, m - 1, 1)
  monthStartIso.setHours(0, 0, 0, 0)
  const monthEndIso = new Date(y, m - 1, last)
  monthEndIso.setHours(23, 59, 59, 999)

  const { data: cellRows, error: cErr } = await supabase
    .from('schedule_month_cells')
    .select('staff_id, work_date, shift, start_time, end_time')
    .eq('store_id', storeId)
    .gte('work_date', `${ym}-01`)
    .lte('work_date', `${ym}-${String(last).padStart(2, '0')}`)
  if (cErr) throw cErr

  const cells = (cellRows ?? [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => {
      const sh = r.shift
      return sh === 'open' || sh === 'middle' || sh === 'close'
    })
    .map((r) => ({
      staff_id: String(r.staff_id),
      work_date: String(r.work_date),
      shift: r.shift as 'open' | 'middle' | 'close',
      start_time: r.start_time == null ? null : String(r.start_time),
      end_time: r.end_time == null ? null : String(r.end_time),
    }))

  const summary: GenerateBaselineSummary = {
    plannedStaffDays: cells.length,
    inserted: 0,
    updated: 0,
    skippedConflict: 0,
    unchanged: 0,
  }

  // 2. 각 cell → baseline upsert
  const cellKeys = new Set<string>()
  for (const cell of cells) {
    cellKeys.add(`${cell.staff_id}|${cell.work_date}`)
    const t = getShiftTimeForDay(
      cell.shift,
      { start_time: cell.start_time, end_time: cell.end_time },
      store,
    )
    const baseDay = parseYmdLocal(cell.work_date)
    baseDay.setHours(0, 0, 0, 0)
    const checkIn = dateAtHmLocal(baseDay, t.startTime)
    const checkOut = dateAtHmLocal(baseDay, t.endTime)
    const targetIn = checkIn.toISOString()
    const targetOut = checkOut.toISOString()

    const dayStart = new Date(baseDay)
    const dayEnd = new Date(baseDay)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data: rows, error: qErr } = await supabase
      .from('attendance')
      .select('id, is_baseline, manually_corrected, check_in, check_out')
      .eq('store_id', storeId)
      .eq('staff_id', cell.staff_id)
      .gte('check_in', dayStart.toISOString())
      .lt('check_in', dayEnd.toISOString())
    if (qErr) throw qErr

    const list = mapAttendanceDayRows(rows as Record<string, unknown>[] | null)

    if (list.length === 0) {
      const { error } = await supabase.from('attendance').insert({
        store_id: storeId,
        staff_id: cell.staff_id,
        check_in: targetIn,
        check_out: targetOut,
        is_baseline: true,
      })
      if (error) throw error
      summary.inserted++
      continue
    }

    const hasConflict = list.some((r) => !r.is_baseline || r.manually_corrected)
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

  // 3. cells에 없는 자동 baseline (휴무로 변경된 날) → DELETE
  //    조건: is_baseline=true AND manually_corrected=false
  const { data: monthBaselineRows, error: mErr } = await supabase
    .from('attendance')
    .select('id, staff_id, check_in')
    .eq('store_id', storeId)
    .eq('is_baseline', true)
    .eq('manually_corrected', false)
    .gte('check_in', monthStartIso.toISOString())
    .lt('check_in', monthEndIso.toISOString())
  if (mErr) throw mErr

  const orphanIds: string[] = []
  for (const r of (monthBaselineRows ?? []) as Record<string, unknown>[]) {
    const checkIn = typeof r.check_in === 'string' ? r.check_in : null
    if (!checkIn) continue
    const d = new Date(checkIn)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const key = `${String(r.staff_id)}|${ymd}`
    if (!cellKeys.has(key)) orphanIds.push(String(r.id))
  }
  if (orphanIds.length > 0) {
    const { error: dErr } = await supabase
      .from('attendance')
      .delete()
      .eq('store_id', storeId)
      .in('id', orphanIds)
    if (dErr) throw dErr
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

/** v1.5 A안 — 월간 근무표 저장 후 baseline 일괄 생성. */
export function useGenerateAttendanceBaselineForMonth() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  const { session } = useAuth()
  const userId = session?.user?.id

  return useMutation({
    mutationFn: async (ym: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      if (!userId) throw new Error('로그인 정보가 없습니다.')
      const storeRow = await ensureStore(userId)
      return generateAttendanceBaselineForMonth(storeId, ym, storeRow)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    },
  })
}
