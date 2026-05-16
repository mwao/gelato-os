import { DEFAULT_SHIFT_TIME_SETTINGS } from '@/lib/dateUtils'

export type ShiftCode = 'open' | 'middle' | 'close'

export interface StaffShiftOverride {
  staff_id: string
  shift: ShiftCode
  start_time: string // 'HH:MM'
  end_time: string // 'HH:MM'
}

export interface ShiftTime {
  startTime: string // 'HH:MM'
  endTime: string // 'HH:MM'
}

/**
 * 매장 인라인 시프트 시각 컬럼. `stores` 테이블의 6개 컬럼만 추리며,
 * `ensureStore`의 `StoreRow`와 호환되도록 nullable 허용.
 */
export type StoreShiftColumns = {
  shift_open_start: string | null
  shift_open_end: string | null
  shift_middle_start: string | null
  shift_middle_end: string | null
  shift_close_start: string | null
  shift_close_end: string | null
}

/**
 * staff별 시프트 시간 해석 (일자 무관):
 * 1순위 `staff_shift_overrides`(staff_id, shift) → 2순위 `stores.shift_*_start/end` → 최종 `DEFAULT_SHIFT_TIME_SETTINGS` 폴백.
 *
 * 「이 직원의 오픈 = X 시간」처럼 매일 같은 시간을 결정할 때 사용.
 */
export function getShiftTimeForStaff(
  staffId: string,
  shift: ShiftCode,
  store: StoreShiftColumns,
  overrides: StaffShiftOverride[],
): ShiftTime {
  const o = overrides.find((x) => x.staff_id === staffId && x.shift === shift)
  if (o) {
    return { startTime: o.start_time, endTime: o.end_time }
  }
  const startKey = `shift_${shift}_start` as const
  const endKey = `shift_${shift}_end` as const
  return {
    startTime: store[startKey] ?? DEFAULT_SHIFT_TIME_SETTINGS[shift].start,
    endTime: store[endKey] ?? DEFAULT_SHIFT_TIME_SETTINGS[shift].end,
  }
}

/**
 * 일별 시각 해석 — v1.5.1 (staff override 분리 적용):
 * 1순위 `schedule_month_cells.start_time/end_time` (특정 날만 예외)
 * 2순위 `stores.shift_*_start/end` (매장 기본)
 * 3순위 `DEFAULT_SHIFT_TIME_SETTINGS` (최종 폴백)
 *
 * **`staff_shift_overrides`는 이 함수에서 사용하지 않는다.** override는 「기본 근무 세팅」 시점에만
 * 적용되어 cell.start_time/end_time에 명시 저장되므로, 일단 cell이 만들어진 뒤에는 자동 반영되지 않음.
 *
 * cell 자체가 없는 날은 휴무이므로 호출 전에 별도 처리. 이 함수는 「이 날 근무한다」가 확정된 후 시각만 결정.
 */
export function getShiftTimeForDay(
  shift: ShiftCode,
  cell: { start_time: string | null; end_time: string | null } | null,
  store: StoreShiftColumns,
): ShiftTime {
  if (cell?.start_time && cell?.end_time) {
    return { startTime: cell.start_time, endTime: cell.end_time }
  }
  const startKey = `shift_${shift}_start` as const
  const endKey = `shift_${shift}_end` as const
  return {
    startTime: store[startKey] ?? DEFAULT_SHIFT_TIME_SETTINGS[shift].start,
    endTime: store[endKey] ?? DEFAULT_SHIFT_TIME_SETTINGS[shift].end,
  }
}
