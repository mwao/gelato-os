import { DEFAULT_SHIFT_TIME_SETTINGS, SHIFT_LABEL } from '@/lib/dateUtils'
import { getShiftTimeForDay, type StoreShiftColumns } from '@/lib/shiftResolver'

export type PlannedWorkDetail = {
  rangeLabel: string
  /** 오픈/미들/마감 구간명 */
  bandLabel: string
  /** 시작 시각 HH:mm (지각 비교용) */
  startHm: string
  /** 종료 시각 HH:mm (근무시간 초과 비교용) */
  endHm: string
}

/**
 * v1.5.3 A안 완성: `schedule_month_cells` 행 배열을 (staffId, workDate) → 예정 상세로 변환.
 * 시각 결정은 `getShiftTimeForDay` 사용 — cell 예외 > 매장 기본 > DEFAULT.
 */
export function plannedFromMonthCells(
  cells: Array<{
    staff_id: string
    work_date: string
    shift: 'open' | 'middle' | 'close'
    start_time: string | null
    end_time: string | null
  }>,
  store: StoreShiftColumns | null,
): Map<string, PlannedWorkDetail> {
  const map = new Map<string, PlannedWorkDetail>()
  const effectiveStore: StoreShiftColumns = store ?? {
    shift_open_start: DEFAULT_SHIFT_TIME_SETTINGS.open.start,
    shift_open_end: DEFAULT_SHIFT_TIME_SETTINGS.open.end,
    shift_middle_start: DEFAULT_SHIFT_TIME_SETTINGS.middle.start,
    shift_middle_end: DEFAULT_SHIFT_TIME_SETTINGS.middle.end,
    shift_close_start: DEFAULT_SHIFT_TIME_SETTINGS.close.start,
    shift_close_end: DEFAULT_SHIFT_TIME_SETTINGS.close.end,
  }
  for (const c of cells) {
    const t = getShiftTimeForDay(
      c.shift,
      { start_time: c.start_time, end_time: c.end_time },
      effectiveStore,
    )
    const key = `${c.staff_id}_${c.work_date}`
    map.set(key, {
      rangeLabel: `${t.startTime}~${t.endTime}`,
      bandLabel: SHIFT_LABEL[c.shift] ?? '근무',
      startHm: t.startTime,
      endHm: t.endTime,
    })
  }
  return map
}

export function diffPlannedVsActualCheckIn(
  plannedStartHm: string,
  actualCheckInIso: string | null | undefined,
  thresholdMin = 5,
): 'late' | 'early' | null {
  if (!actualCheckInIso) return null
  const [ph, pm] = plannedStartHm.split(':').map((x) => parseInt(x, 10))
  if (Number.isNaN(ph)) return null
  const plannedMin = ph * 60 + (Number.isNaN(pm) ? 0 : pm)
  const d = new Date(actualCheckInIso)
  const actualMin = d.getHours() * 60 + d.getMinutes()
  if (actualMin - plannedMin > thresholdMin) return 'late'
  if (plannedMin - actualMin > thresholdMin) return 'early'
  return null
}
