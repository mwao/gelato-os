import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import type { ShiftCode } from '@/hooks/useStaff'
import { daysInMonth } from '@/lib/dateUtils'
import { supabase } from '@/lib/supabase'

export type MonthCellRow = {
  id: string
  staff_id: string
  staff_name: string
  work_date: string
  shift: ShiftCode
}

function mapCell(raw: Record<string, unknown>): MonthCellRow | null {
  const shift = raw.shift as string
  if (shift !== 'open' && shift !== 'middle' && shift !== 'close') return null
  let staff_name = ''
  const st = raw.staff
  if (st && typeof st === 'object' && !Array.isArray(st)) {
    staff_name = String((st as { name?: string }).name ?? '')
  }
  return {
    id: String(raw.id),
    staff_id: String(raw.staff_id),
    staff_name,
    work_date: String(raw.work_date),
    shift,
  }
}

async function fetchMonthCells(
  storeId: string,
  ym: string,
): Promise<MonthCellRow[]> {
  const [y, m] = ym.split('-').map(Number)
  const last = daysInMonth(y, m)
  const start = `${ym}-01`
  const end = `${ym}-${String(last).padStart(2, '0')}`

  const { data, error } = await supabase
    .from('schedule_month_cells')
    .select(`id, staff_id, work_date, shift, staff ( name )`)
    .eq('store_id', storeId)
    .gte('work_date', start)
    .lte('work_date', end)

  if (error) throw error
  return (data ?? [])
    .map((r) => mapCell(r as Record<string, unknown>))
    .filter((x): x is MonthCellRow => x !== null)
}

/** `schedule_month_cells` 를 날짜 구간으로 조회 (주간에 월간 반영 시 사용). */
export async function fetchMonthCellsDateRange(
  storeId: string,
  start: string,
  end: string,
): Promise<MonthCellRow[]> {
  const { data, error } = await supabase
    .from('schedule_month_cells')
    .select(`id, staff_id, work_date, shift, staff ( name )`)
    .eq('store_id', storeId)
    .gte('work_date', start)
    .lte('work_date', end)

  if (error) throw error
  return (data ?? [])
    .map((r) => mapCell(r as Record<string, unknown>))
    .filter((x): x is MonthCellRow => x !== null)
}

export function useMonthCells(ym: string | undefined) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['monthSchedule', storeId, ym],
    enabled: Boolean(storeId && ym && ym.length === 7),
    queryFn: () => fetchMonthCells(storeId!, ym!),
  })
}

/** 주간 뷰 칩 색·월간 연동 등에 사용: 날짜 구간으로 `schedule_month_cells` 조회 */
export function useMonthCellsDateRange(
  start: string | undefined,
  end: string | undefined,
) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['monthScheduleRange', storeId, start, end],
    enabled: Boolean(storeId && start && end),
    queryFn: () => fetchMonthCellsDateRange(storeId!, start!, end!),
  })
}

export function useUpsertMonthCell() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      ym: string
      staffId: string
      workDate: string
      shift: ShiftCode | null
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')

      if (input.shift === null) {
        const { error } = await supabase
          .from('schedule_month_cells')
          .delete()
          .eq('store_id', storeId)
          .eq('staff_id', input.staffId)
          .eq('work_date', input.workDate)
        if (error) throw error
        const dayNum = parseInt(input.workDate.split('-')[2]!, 10)
        await supabase
          .from('staff_calendar_assignments')
          .delete()
          .eq('store_id', storeId)
          .eq('staff_id', input.staffId)
          .eq('yyyymm', input.ym)
          .eq('day', dayNum)
      } else {
        const { error } = await supabase.from('schedule_month_cells').upsert(
          {
            store_id: storeId,
            staff_id: input.staffId,
            work_date: input.workDate,
            shift: input.shift,
          },
          { onConflict: 'staff_id,work_date' },
        )
        if (error) throw error

        const dayNum = parseInt(input.workDate.split('-')[2]!, 10)
        const yyyymm = input.ym

        await supabase.from('staff_calendar_assignments').delete().match({
          store_id: storeId,
          staff_id: input.staffId,
          yyyymm,
          day: dayNum,
        })

        const { error: calErr } = await supabase
          .from('staff_calendar_assignments')
          .insert({
            store_id: storeId,
            staff_id: input.staffId,
            yyyymm,
            day: dayNum,
            shift: input.shift,
          })
        if (calErr) throw calErr
      }
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['monthSchedule', storeId, v.ym],
      })
      void queryClient.invalidateQueries({
        queryKey: ['monthScheduleRange', storeId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['staffCalendar', v.staffId],
      })
    },
  })
}

type StaffShiftRow = { day_of_week: number; shift: ShiftCode }

/** schedule_month_cells 는 직원·날짜당 1시프트만 가능. 프로필에 동일 요일·다른 시프트가 여러 개면 open→middle→close 로 하나만 선택. */
const PROFILE_SHIFT_ORDER: ShiftCode[] = ['open', 'middle', 'close']

function pickShiftForWeekday(
  rows: StaffShiftRow[],
  dow: number,
): ShiftCode | undefined {
  const forDay = rows.filter((r) => r.day_of_week === dow)
  if (forDay.length === 0) return undefined
  for (const code of PROFILE_SHIFT_ORDER) {
    if (forDay.some((r) => r.shift === code)) return code
  }
  return forDay[0]!.shift
}

export async function fetchStaffWithDefaultShifts(
  storeId: string,
): Promise<{ id: string; shifts: StaffShiftRow[] }[]> {
  const { data, error } = await supabase
    .from('staff')
    .select(
      `
      id,
      staff_default_shifts ( day_of_week, shift )
    `,
    )
    .eq('store_id', storeId)

  if (error) throw error
  const out: { id: string; shifts: StaffShiftRow[] }[] = []
  for (const row of data ?? []) {
    const raw = row as Record<string, unknown>
    const id = String(raw.id)
    const nested = raw.staff_default_shifts
    const arr = Array.isArray(nested) ? nested : []
    const shifts: StaffShiftRow[] = []
    for (const x of arr) {
      const o = x as Record<string, unknown>
      const dow = Number(o.day_of_week)
      const sh = o.shift as string
      if (
        !Number.isNaN(dow) &&
        (sh === 'open' || sh === 'middle' || sh === 'close')
      ) {
        shifts.push({ day_of_week: dow, shift: sh })
      }
    }
    out.push({ id, shifts })
  }
  return out
}

/** 프로필 근무요일을 바탕으로 해당 월 전체 schedule_month_cells + 달력 배정을 덮어씁니다. */
export function useApplyMonthDefaultFromProfiles() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (ym: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const [y, m] = ym.split('-').map(Number)
      const dim = daysInMonth(y, m)
      const staffRows = await fetchStaffWithDefaultShifts(storeId)

      for (const s of staffRows) {
        await supabase
          .from('schedule_month_cells')
          .delete()
          .eq('store_id', storeId)
          .eq('staff_id', s.id)
          .gte('work_date', `${ym}-01`)
          .lte('work_date', `${ym}-${String(dim).padStart(2, '0')}`)

        await supabase
          .from('staff_calendar_assignments')
          .delete()
          .eq('store_id', storeId)
          .eq('staff_id', s.id)
          .eq('yyyymm', ym)

        for (let day = 1; day <= dim; day++) {
          const wd = new Date(y, m - 1, day).getDay()
          const shift = pickShiftForWeekday(s.shifts, wd)
          if (!shift) continue
          const workDate = `${ym}-${String(day).padStart(2, '0')}`
          const { error: cErr } = await supabase.from('schedule_month_cells').insert({
            store_id: storeId,
            staff_id: s.id,
            work_date: workDate,
            shift,
          })
          if (cErr) throw cErr
          const { error: aErr } = await supabase
            .from('staff_calendar_assignments')
            .insert({
              store_id: storeId,
              staff_id: s.id,
              yyyymm: ym,
              day,
              shift,
            })
          if (aErr) throw aErr
        }
      }
    },
    onSuccess: (_, ym) => {
      void queryClient.invalidateQueries({
        queryKey: ['monthSchedule', storeId, ym],
      })
      void queryClient.invalidateQueries({ queryKey: ['staffCalendar'] })
    },
  })
}

export type MonthDraftEntry = { staffId: string; workDate: string; shift: ShiftCode | null }

/** 월간 달력 초안 일괄 저장 (`schedule_month_cells` + `staff_calendar_assignments` 동기). */
export function usePersistMonthScheduleDraft() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  const upsert = useUpsertMonthCell()

  return useMutation({
    mutationFn: async (input: { ym: string; entries: MonthDraftEntry[] }) => {
      for (const e of input.entries) {
        await upsert.mutateAsync({
          ym: input.ym,
          staffId: e.staffId,
          workDate: e.workDate,
          shift: e.shift,
        })
      }
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['monthSchedule', storeId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['monthSchedule', storeId, v.ym],
      })
      void queryClient.invalidateQueries({
        queryKey: ['monthScheduleRange', storeId],
      })
      void queryClient.invalidateQueries({ queryKey: ['staffCalendar'] })
    },
  })
}
