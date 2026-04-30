import type { AttendanceRow } from '@/hooks/useAttendance'
import { formatYmdLocal } from '@/lib/dateUtils'

const THRESHOLD_MS = 5 * 60 * 1000

export type StaffDayBlock = {
  staff_id: string
  staff_name: string
  baseline?: AttendanceRow
  actual?: AttendanceRow
}

export type DateGroupedAttendance = {
  dateKey: string
  blocks: StaffDayBlock[]
}

export function localDateKeyFromCheckIn(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return formatYmdLocal(d)
}

function pickActual(rows: AttendanceRow[]): AttendanceRow | undefined {
  if (!rows.length) return undefined
  const complete = rows.filter((r) => r.check_in && r.check_out)
  const pool = complete.length ? complete : rows
  return [...pool].sort((a, b) => {
    const ta = new Date(a.check_in ?? 0).getTime()
    const tb = new Date(b.check_in ?? 0).getTime()
    return tb - ta
  })[0]
}

/** 날짜(로컬) → 직원별 기준선·실제 1건씩 묶음 */
export function groupAttendanceByDateStaff(rows: AttendanceRow[]): DateGroupedAttendance[] {
  const outer = new Map<
    string,
    Map<string, { staff_name: string; baseline?: AttendanceRow; actuals: AttendanceRow[] }>
  >()

  for (const r of rows) {
    const dk = localDateKeyFromCheckIn(r.check_in)
    if (!dk) continue
    if (!outer.has(dk)) outer.set(dk, new Map())
    const inner = outer.get(dk)!
    if (!inner.has(r.staff_id)) {
      inner.set(r.staff_id, { staff_name: r.staff_name, actuals: [] })
    }
    const cell = inner.get(r.staff_id)!
    if (r.staff_name) cell.staff_name = r.staff_name
    if (r.is_baseline) cell.baseline = r
    else cell.actuals.push(r)
  }

  const dates = [...outer.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  return dates.map((dateKey) => {
    const inner = outer.get(dateKey)!
    const blocks: StaffDayBlock[] = []
    for (const [staff_id, v] of inner) {
      blocks.push({
        staff_id,
        staff_name: v.staff_name,
        baseline: v.baseline,
        actual: pickActual(v.actuals),
      })
    }
    blocks.sort((a, b) => a.staff_name.localeCompare(b.staff_name, 'ko'))
    return { dateKey, blocks }
  })
}

export type DiffKind = 'late' | 'early_leave' | 'ok'

export function diffAttendance(
  baseline: AttendanceRow | undefined,
  actual: AttendanceRow | undefined,
): DiffKind | null {
  if (!baseline?.check_in || !actual?.check_in) return null
  const bin = new Date(baseline.check_in).getTime()
  const ain = new Date(actual.check_in).getTime()
  if (ain - bin > THRESHOLD_MS) return 'late'

  if (baseline.check_out && actual.check_out) {
    const bout = new Date(baseline.check_out).getTime()
    const aout = new Date(actual.check_out).getTime()
    if (bout - aout > THRESHOLD_MS) return 'early_leave'
  }

  return 'ok'
}
