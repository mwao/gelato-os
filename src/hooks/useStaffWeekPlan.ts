import { useMemo } from 'react'

import { useMonthCells } from '@/hooks/useMonthSchedule'
import { useShiftTimeSettings } from '@/hooks/useShiftSettings'
import { DEFAULT_SHIFT_TIME_SETTINGS, SHIFT_LABEL } from '@/lib/dateUtils'
import { getShiftTimeForDay, type StoreShiftColumns } from '@/lib/shiftResolver'

export type DayPlanSummary = {
  workDate: string
  /** 시간 범위 표시 — "09:00~14:00" */
  rangeLabel: string
  /** 시프트 라벨 — "오픈" / "미들" / "마감" */
  bandLabel: string
}

/**
 * v1.5.4 A안 완성: 직원의 한 달 근무 일정 — `schedule_month_cells` 기반.
 * 직원프로필 「근무 달력」에서 사용.
 */
export function useStaffWeekCalendarPlans(
  staffId: string | undefined,
  yyyymm: string,
) {
  const { data: shiftStore } = useShiftTimeSettings()
  const store: StoreShiftColumns = shiftStore?.store ?? {
    shift_open_start: DEFAULT_SHIFT_TIME_SETTINGS.open.start,
    shift_open_end: DEFAULT_SHIFT_TIME_SETTINGS.open.end,
    shift_middle_start: DEFAULT_SHIFT_TIME_SETTINGS.middle.start,
    shift_middle_end: DEFAULT_SHIFT_TIME_SETTINGS.middle.end,
    shift_close_start: DEFAULT_SHIFT_TIME_SETTINGS.close.start,
    shift_close_end: DEFAULT_SHIFT_TIME_SETTINGS.close.end,
  }

  const { data: cells, isLoading } = useMonthCells(yyyymm)

  const byDay = useMemo(() => {
    const map = new Map<number, DayPlanSummary>()
    if (!staffId || !cells) return map
    for (const c of cells) {
      if (c.staff_id !== staffId) continue
      const dayNum = parseInt(c.work_date.slice(8, 10), 10)
      if (Number.isNaN(dayNum)) continue
      const t = getShiftTimeForDay(
        c.shift,
        { start_time: c.start_time, end_time: c.end_time },
        store,
      )
      map.set(dayNum, {
        workDate: c.work_date,
        rangeLabel: `${t.startTime}~${t.endTime}`,
        bandLabel: SHIFT_LABEL[c.shift] ?? '근무',
      })
    }
    return map
  }, [staffId, cells, store])

  return { byDay, isLoading }
}
