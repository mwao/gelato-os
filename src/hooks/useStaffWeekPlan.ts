import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { fetchWeekSlots, type WeekSlot } from '@/hooks/useWeekSchedule'
import {
  daysInMonth,
  formatYmdLocal,
  formatPlannedSlotRange,
  parseYmdLocal,
  startOfIsoWeekMonday,
  SHIFT_LABEL,
  shiftForSlotIndex,
  DEFAULT_SHIFT_TIME_SETTINGS,
  type ShiftTimeSettings,
  addDaysLocal,
} from '@/lib/dateUtils'
import { useShiftTimeSettings } from '@/hooks/useShiftSettings'

export function weekStartsTouchingMonth(y: number, m: number): string[] {
  const dim = daysInMonth(y, m)
  const set = new Set<string>()
  for (let day = 1; day <= dim; day++) {
    const d = new Date(y, m - 1, day)
    set.add(formatYmdLocal(startOfIsoWeekMonday(d)))
  }
  return [...set].sort()
}

export type DayPlanSummary = {
  workDate: string
  slotIndices: number[]
  rangeLabel: string
  bandLabel: string
}

export function useStaffWeekCalendarPlans(
  staffId: string | undefined,
  yyyymm: string,
) {
  const { data: store } = useStore()
  const storeId = store?.id
  const { data: shiftStore } = useShiftTimeSettings()
  const settings: ShiftTimeSettings =
    shiftStore?.settings ?? DEFAULT_SHIFT_TIME_SETTINGS

  const [y, m] = yyyymm.split('-').map(Number)
  const weekStarts = useMemo(
    () =>
      yyyymm.length === 7 && !Number.isNaN(y) && !Number.isNaN(m)
        ? weekStartsTouchingMonth(y, m)
        : [],
    [y, m, yyyymm],
  )

  const results = useQueries({
    queries: weekStarts.map((ws) => ({
      queryKey: ['weekSchedule', storeId, ws] as const,
      queryFn: () => fetchWeekSlots(storeId!, ws),
      enabled: Boolean(storeId && staffId),
    })),
  })

  const byDay = useMemo(() => {
    const map = new Map<number, DayPlanSummary>()
    if (!staffId) return map

    for (let i = 0; i < weekStarts.length; i++) {
      const ws = weekStarts[i]!
      const slots: WeekSlot[] | undefined = results[i]?.data
      if (!slots?.length) continue
      const base = parseYmdLocal(ws)
      for (const slot of slots) {
        if (!slot.assignees.some((a) => a.staff_id === staffId)) continue
        const ymd = formatYmdLocal(addDaysLocal(base, slot.day_index))
        if (!ymd.startsWith(yyyymm)) continue
        const dayNum = parseInt(ymd.slice(8, 10), 10)
        if (!map.has(dayNum)) {
          map.set(dayNum, {
            workDate: ymd,
            slotIndices: [],
            rangeLabel: '',
            bandLabel: '근무',
          })
        }
        const ent = map.get(dayNum)!
        ent.slotIndices.push(slot.slot_index)
      }
    }

    for (const v of map.values()) {
      v.slotIndices = [...new Set(v.slotIndices)].sort((a, b) => a - b)
      v.rangeLabel = formatPlannedSlotRange(v.slotIndices)
      const first = v.slotIndices[0]
      if (first !== undefined) {
        const code = shiftForSlotIndex(first, settings)
        v.bandLabel = code ? SHIFT_LABEL[code] : '근무'
      }
    }
    return map
  }, [staffId, yyyymm, weekStarts, results, settings])

  return { byDay, isLoading: results.some((r) => r.isLoading) }
}
