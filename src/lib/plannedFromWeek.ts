import type { WeekSlot } from '@/hooks/useWeekSchedule'
import {
  addDaysLocal,
  DEFAULT_SHIFT_TIME_SETTINGS,
  formatPlannedSlotRange,
  formatYmdLocal,
  parseYmdLocal,
  SHIFT_LABEL,
  shiftForSlotIndex,
  type ShiftTimeSettings,
  WEEK_SLOT_LABELS,
} from '@/lib/dateUtils'
export type PlannedWorkDetail = {
  rangeLabel: string
  /** 오픈/미들/마감 구간명 (슬롯이 구간 밖이면 '근무') */
  bandLabel: string
  /** 첫 슬롯 시각 HH:mm (지각 비교용) */
  startHm: string
}

function bandLabelForFirstSlot(
  firstSlotIndex: number,
  settings: ShiftTimeSettings,
): string {
  const code = shiftForSlotIndex(firstSlotIndex, settings)
  if (code) return SHIFT_LABEL[code] ?? '근무'
  return '근무'
}

export function plannedDetailForStaffDay(
  slots: WeekSlot[],
  weekStart: string,
  staffId: string,
  workDate: string,
  settings: ShiftTimeSettings,
): PlannedWorkDetail | null {
  const base = parseYmdLocal(weekStart)
  const target = parseYmdLocal(workDate)
  const dayIdx = Math.round(
    (target.setHours(0, 0, 0, 0) - base.setHours(0, 0, 0, 0)) / 86400000,
  )
  if (dayIdx < 0 || dayIdx > 6) return null

  const indices: number[] = []
  for (const slot of slots) {
    if (slot.day_index !== dayIdx) continue
    if (!slot.assignees.some((a) => a.staff_id === staffId)) continue
    indices.push(slot.slot_index)
  }
  if (!indices.length) return null
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const first = sorted[0]!
  return {
    rangeLabel: formatPlannedSlotRange(sorted),
    bandLabel: bandLabelForFirstSlot(first, settings),
    startHm: WEEK_SLOT_LABELS[first] ?? '09:00',
  }
}

/** 여러 주의 슬롯을 합쳐 (staffId, workDate) → 예정 상세 */
export function mergePlannedByStaffDate(
  weekStarts: string[],
  slotsPerWeek: (WeekSlot[] | undefined)[],
  settings: ShiftTimeSettings = DEFAULT_SHIFT_TIME_SETTINGS,
): Map<string, PlannedWorkDetail> {
  const map = new Map<string, PlannedWorkDetail>()
  for (let i = 0; i < weekStarts.length; i++) {
    const ws = weekStarts[i]
    const slots = slotsPerWeek[i]
    if (!ws || !slots?.length) continue
    const base = parseYmdLocal(ws)
    const seen = new Set<string>()
    for (const slot of slots) {
      const ymd = formatYmdLocal(addDaysLocal(base, slot.day_index))
      for (const a of slot.assignees) {
        const key = `${a.staff_id}_${ymd}`
        if (seen.has(key)) continue
        const det = plannedDetailForStaffDay(slots, ws, a.staff_id, ymd, settings)
        if (det) {
          map.set(key, det)
          seen.add(key)
        }
      }
    }
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
