import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useStore } from '@/hooks/useStore'
import type { PayMode } from '@/hooks/useEmploymentTypes'
import type { PayWarning } from '@/lib/payroll'
import { supabase } from '@/lib/supabase'

export type PayrollRow = {
  id: string
  staff_id: string
  period_start: string
  period_end: string
  pay_mode: PayMode | null
  base_pay: number
  bonus: number
  allowances: number
  deductions: number
  total: number
  work_minutes: number
  off_days_used: number | null
  off_days_required: number | null
  off_days_warning: PayWarning
  note: string | null
  confirmed: boolean
}

function mapPayrollRow(raw: Record<string, unknown>): PayrollRow | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const staff_id = typeof raw.staff_id === 'string' ? raw.staff_id : null
  const period_start = typeof raw.period_start === 'string' ? raw.period_start : null
  const period_end = typeof raw.period_end === 'string' ? raw.period_end : null
  if (!id || !staff_id || !period_start || !period_end) return null

  const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? '0')) || 0)
  const intOrNull = (v: unknown) =>
    v == null ? null : typeof v === 'number' ? v : parseInt(String(v), 10) || 0
  const payMode: PayMode | null =
    raw.pay_mode === 'salary' ? 'salary' : raw.pay_mode === 'hourly' ? 'hourly' : null
  const warning: PayWarning =
    raw.off_days_warning === 'shortage'
      ? 'shortage'
      : raw.off_days_warning === 'excess'
        ? 'excess'
        : null

  return {
    id,
    staff_id,
    period_start,
    period_end,
    pay_mode: payMode,
    base_pay: num(raw.base_pay),
    bonus: num(raw.bonus),
    allowances: num(raw.allowances),
    deductions: num(raw.deductions),
    total: num(raw.total),
    work_minutes: typeof raw.work_minutes === 'number' ? raw.work_minutes : 0,
    off_days_used: intOrNull(raw.off_days_used),
    off_days_required: intOrNull(raw.off_days_required),
    off_days_warning: warning,
    note: raw.note == null ? null : String(raw.note),
    confirmed: Boolean(raw.confirmed),
  }
}

export function usePayrollList(periodStart: string) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['payroll', storeId, periodStart],
    enabled: Boolean(storeId) && Boolean(periodStart),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll')
        .select(
          'id, staff_id, period_start, period_end, pay_mode, base_pay, bonus, allowances, deductions, total, work_minutes, off_days_used, off_days_required, off_days_warning, note, confirmed',
        )
        .eq('store_id', storeId!)
        .eq('period_start', periodStart)
        .order('created_at')

      if (error) throw error
      return (data ?? [])
        .map((r) => mapPayrollRow(r as Record<string, unknown>))
        .filter((r): r is PayrollRow => r !== null)
    },
    staleTime: 0,
  })
}

/** 기간 내 실근무 분을 직원별로 집계 — is_baseline=false, check_out IS NOT NULL 조건. */
export function useAttendanceWorkSummary(from: string, to: string) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['attendanceWorkSummary', storeId, from, to],
    enabled: Boolean(storeId) && Boolean(from) && Boolean(to),
    queryFn: async () => {
      const dayStart = new Date(from)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(to)
      dayEnd.setDate(dayEnd.getDate() + 1)
      dayEnd.setHours(0, 0, 0, 0)

      const { data, error } = await supabase
        .from('attendance')
        .select('staff_id, check_in, check_out')
        .eq('store_id', storeId!)
        .eq('is_baseline', false)
        .not('check_out', 'is', null)
        .gte('check_in', dayStart.toISOString())
        .lt('check_in', dayEnd.toISOString())

      if (error) throw error

      const minutesByStaff = new Map<string, number>()
      for (const row of data ?? []) {
        const staff_id = typeof row.staff_id === 'string' ? row.staff_id : null
        const checkIn = typeof row.check_in === 'string' ? row.check_in : null
        const checkOut = typeof row.check_out === 'string' ? row.check_out : null
        if (!staff_id || !checkIn || !checkOut) continue

        const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime()
        if (!Number.isFinite(ms) || ms <= 0) continue
        const mins = Math.round(ms / 60000)
        minutesByStaff.set(staff_id, (minutesByStaff.get(staff_id) ?? 0) + mins)
      }

      return minutesByStaff
    },
    staleTime: 0,
  })
}

export function useUpsertPayroll() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      staffId: string
      periodStart: string
      periodEnd: string
      payMode: PayMode
      basePay: number
      bonus?: number
      allowances: number
      deductions?: number
      workMinutes: number
      offDaysUsed?: number | null
      offDaysRequired?: number | null
      offDaysWarning?: PayWarning
      note?: string | null
      confirmed?: boolean
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')

      const bonus = input.bonus ?? 0
      const deductions = input.deductions ?? 0
      const total = input.basePay + bonus + input.allowances - deductions

      const { error } = await supabase.from('payroll').upsert(
        {
          store_id: storeId,
          staff_id: input.staffId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          pay_mode: input.payMode,
          base_pay: input.basePay,
          bonus,
          allowances: input.allowances,
          deductions,
          total,
          work_minutes: input.workMinutes,
          off_days_used: input.offDaysUsed ?? null,
          off_days_required: input.offDaysRequired ?? null,
          off_days_warning: input.offDaysWarning ?? null,
          note: input.note ?? null,
          confirmed: input.confirmed ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id,staff_id,period_start' },
      )
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payroll'], refetchType: 'active' })
    },
  })
}

export type AttendancePeriodRecord = {
  id: string
  staff_id: string
  check_in: string
  check_out: string
}

/** 기간 내 실근무 출퇴근 행 전체 — is_baseline=false, check_out IS NOT NULL. 상세 패널 렌더용. */
export function useAttendanceDetailsForPeriod(from: string, to: string) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['attendancePeriodDetail', storeId, from, to],
    enabled: Boolean(storeId) && Boolean(from) && Boolean(to),
    queryFn: async () => {
      const dayStart = new Date(from)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(to)
      dayEnd.setDate(dayEnd.getDate() + 1)
      dayEnd.setHours(0, 0, 0, 0)

      const { data, error } = await supabase
        .from('attendance')
        .select('id, staff_id, check_in, check_out')
        .eq('store_id', storeId!)
        .eq('is_baseline', false)
        .not('check_out', 'is', null)
        .gte('check_in', dayStart.toISOString())
        .lt('check_in', dayEnd.toISOString())
        .order('check_in')

      if (error) throw error
      return (data ?? []).filter(
        (r) =>
          typeof r.staff_id === 'string' &&
          typeof r.check_in === 'string' &&
          typeof r.check_out === 'string',
      ) as AttendancePeriodRecord[]
    },
    staleTime: 0,
  })
}

export function useDeletePayroll() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (payrollId: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('payroll')
        .delete()
        .eq('id', payrollId)
        .eq('store_id', storeId)
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payroll'], refetchType: 'active' })
    },
  })
}
