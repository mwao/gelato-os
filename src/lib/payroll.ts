import type { EmploymentTypeRow, PayMode } from '@/hooks/useEmploymentTypes'
import type { StaffListRow } from '@/hooks/useStaff'

export type PayWarning = 'shortage' | 'excess' | null

export type AttendanceRecord = {
  staff_id: string
  check_in: string | null
  check_out: string | null
  is_baseline?: boolean
}

export type CalcPayInput = {
  staff: Pick<StaffListRow, 'id' | 'hourly_rate' | 'base_salary' | 'monthly_off_days'>
  type: Pick<EmploymentTypeRow, 'pay_mode' | 'monthly_off_days'> | null
  attendance: AttendanceRecord[]
  period: { start: string; end: string } // YYYY-MM-DD
  manualBonus?: number
  /**
   * salary 모드 휴무 산출용: 해당 월 `schedule_month_cells`에 배정된 날짜 set.
   * 제공되면 「월일수 − 배정일수」로 계산 (근무표 기반).
   * 미제공이면 `countOffDays`(attendance 기반)로 폴백.
   */
  scheduledDates?: Set<string>
}

export type CalcPayResult = {
  pay_mode: PayMode
  base_pay: number
  bonus: number
  allowances: number
  deductions: number
  work_minutes: number
  off_days_used: number | null
  off_days_required: number | null
  off_days_warning: PayWarning
  total: number
}

/** 실근무 분 합계 — is_baseline=false, check_out 있음. */
export function sumActualMinutes(
  staffId: string,
  attendance: AttendanceRecord[],
  period: { start: string; end: string },
): number {
  const startMs = new Date(period.start).setHours(0, 0, 0, 0)
  const endMs = new Date(period.end).setHours(23, 59, 59, 999)
  let total = 0
  for (const r of attendance) {
    if (r.staff_id !== staffId) continue
    if (r.is_baseline) continue
    if (!r.check_in || !r.check_out) continue
    const inMs = new Date(r.check_in).getTime()
    if (inMs < startMs || inMs > endMs) continue
    const diff = new Date(r.check_out).getTime() - inMs
    if (!Number.isFinite(diff) || diff <= 0) continue
    total += Math.round(diff / 60000)
  }
  return total
}

export function sumActualHours(
  staffId: string,
  attendance: AttendanceRecord[],
  period: { start: string; end: string },
): number {
  return sumActualMinutes(staffId, attendance, period) / 60
}

/**
 * 휴무일수 — 해당 기간 안에서 실제 출퇴근 행이 없는 날의 수.
 * v1.4 §9 미결 #4: 1차 구현은 attendance 기준.
 */
export function countOffDays(
  staffId: string,
  attendance: AttendanceRecord[],
  period: { start: string; end: string },
): number {
  const start = new Date(period.start)
  start.setHours(0, 0, 0, 0)
  const end = new Date(period.end)
  end.setHours(0, 0, 0, 0)
  if (end < start) return 0

  const workedDates = new Set<string>()
  for (const r of attendance) {
    if (r.staff_id !== staffId) continue
    if (r.is_baseline) continue
    if (!r.check_in) continue
    const d = new Date(r.check_in)
    if (d < start || d > end) continue
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    workedDates.add(ymd)
  }

  let offDays = 0
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (!workedDates.has(ymd)) offDays++
  }
  return offDays
}

/**
 * 주휴수당 — 월 실근무시간 기준 주평균 15h 이상 시 발생.
 * v1.4 §9 미결 #2: 잠정 수식, 추후 근로기준법 시나리오 정교화 예정.
 */
export function calcHolidayPay(workMinutes: number, hourlyRate: number): number {
  const totalHours = workMinutes / 60
  const avgWeekly = totalHours / 4
  if (avgWeekly < 15) return 0
  return Math.round(avgWeekly * hourlyRate)
}

/**
 * 야간수당 — 22:00~06:00 구간 합산. v1.4 §9 미결 (미구현).
 * 자리만 유지: 호출 사이트가 미리 0을 받아도 동작하도록.
 */
export function calcNightPay(
  _attendance: AttendanceRecord[],
  _hourlyRate: number,
): number {
  return 0
}

/**
 * 급여 계산 진입점 — `employment_types.pay_mode`로 분기.
 * salary: 기본급 + 상여(manualBonus). 휴무 미달/초과는 경고만(자동 감액 X).
 * hourly: 시급 × 실근무시간 + 주휴(잠정) + 야간(미구현).
 *
 * type이 null이면 fallback으로 'hourly' 취급.
 */
export function calcPay(input: CalcPayInput): CalcPayResult {
  const { staff, type, attendance, period, manualBonus = 0, scheduledDates } = input
  const mode: PayMode = type?.pay_mode ?? 'hourly'
  const workMinutes = sumActualMinutes(staff.id, attendance, period)

  if (mode === 'salary') {
    // scheduledDates 제공 시: 월일수 - 배정일수 (근무표 기반, 정확)
    // 미제공 시: countOffDays (attendance 기반, 출퇴근 미기록이면 전체 휴무로 잡힘)
    let offDays: number
    if (scheduledDates) {
      const [y, m] = period.start.split('-').map(Number)
      const dim = y && m ? new Date(y, m, 0).getDate() : 30
      offDays = dim - scheduledDates.size
      if (offDays < 0) offDays = 0
    } else {
      offDays = countOffDays(staff.id, attendance, period)
    }
    // 개인 오버라이드(staff.monthly_off_days) 우선, 없으면 고용형태 기본값, 그것도 없으면 8
    const required = staff.monthly_off_days ?? type?.monthly_off_days ?? 8
    const warning: PayWarning =
      offDays < required ? 'shortage' : offDays > required ? 'excess' : null
    const basePay = staff.base_salary ?? 0
    return {
      pay_mode: 'salary',
      base_pay: basePay,
      bonus: manualBonus,
      allowances: 0,
      deductions: 0,
      work_minutes: workMinutes,
      off_days_used: offDays,
      off_days_required: required,
      off_days_warning: warning,
      total: basePay + manualBonus,
    }
  }

  // hourly
  const rate = staff.hourly_rate ?? 0
  const basePay = Math.round((workMinutes / 60) * rate)
  const holiday = calcHolidayPay(workMinutes, rate)
  const night = calcNightPay(attendance, rate)
  const allowances = holiday + night
  return {
    pay_mode: 'hourly',
    base_pay: basePay,
    bonus: 0,
    allowances,
    deductions: 0,
    work_minutes: workMinutes,
    off_days_used: null,
    off_days_required: null,
    off_days_warning: null,
    total: basePay + allowances,
  }
}
