import { useMemo, useRef, useState } from 'react'
import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DOW_KO } from '@/lib/dateUtils'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import {
  useEmploymentTypes,
  type EmploymentTypeRow,
} from '@/hooks/useEmploymentTypes'
import { useStaffList } from '@/hooks/useStaff'
import { useStore } from '@/hooks/useStore'
import { useMonthCells } from '@/hooks/useMonthSchedule'
import {
  usePayrollList,
  useAttendanceDetailsForPeriod,
  useUpsertPayroll,
  useDeletePayroll,
  type PayrollRow,
  type AttendancePeriodRecord,
} from '@/hooks/usePayroll'
import { calcPay, type CalcPayResult } from '@/lib/payroll'

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function ymToPeriod(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function addMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function ymLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${y}년 ${m}월`
}

function fmtWon(n: number): string {
  return `${Math.round(n).toLocaleString()}원`
}

function fmtHours(mins: number): string {
  if (mins <= 0) return '0h'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtHm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const dow = DOW_KO[d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${dow})`
}

// ─── 요약 카드 ────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums',
          accent && 'text-primary',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function StatusBadge({ confirmed, hasSaved }: { confirmed: boolean; hasSaved: boolean }) {
  if (confirmed)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        확정 완료
      </span>
    )
  if (hasSaved)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
        <span className="size-1.5 rounded-full bg-sky-500" />
        계산됨
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
      <span className="size-1.5 rounded-full bg-amber-500" />
      미정산
    </span>
  )
}

function PayModeBadge({ mode }: { mode: 'salary' | 'hourly' }) {
  return mode === 'salary' ? (
    <span className="inline-flex rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
      월급제
    </span>
  ) : (
    <span className="inline-flex rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
      시급제
    </span>
  )
}

// ─── 상세 패널 ────────────────────────────────────────────────────────────────

function DetailPanel({
  staffName,
  employmentLabel,
  computed,
  saved,
  attendanceRows,
  ym,
  onConfirm,
  onDelete,
  onClose,
  isPending,
}: {
  staffName: string
  employmentLabel: string | null
  computed: CalcPayResult & { staffId: string }
  saved: PayrollRow | undefined
  attendanceRows: AttendancePeriodRecord[]
  ym: string
  onConfirm: (staffId: string, confirmed: boolean) => Promise<void>
  onDelete: (payrollId: string) => Promise<void>
  onClose: () => void
  isPending: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const myRows = attendanceRows.filter((r) => r.staff_id === computed.staffId)
  const totalMinutes = myRows.reduce((acc, r) => {
    const ms = new Date(r.check_out).getTime() - new Date(r.check_in).getTime()
    return acc + (ms > 0 ? Math.round(ms / 60000) : 0)
  }, 0)

  const avgWeekly = computed.work_minutes / 60 / 4

  async function handleConfirm() {
    setErr(null)
    setConfirming(true)
    try {
      await onConfirm(computed.staffId, true)
    } catch (e) {
      setErr(getPostgrestMessage(e))
    } finally {
      setConfirming(false)
    }
  }

  async function handleDelete() {
    if (!saved) return
    if (!window.confirm(`${staffName}의 급여 기록을 삭제할까요?`)) return
    setErr(null)
    setDeleting(true)
    try {
      await onDelete(saved.id)
    } catch (e) {
      setErr(getPostgrestMessage(e))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-2 rounded-xl border border-border/60 bg-card shadow-sm duration-150">
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-6 py-4 rounded-t-xl">
        <div>
          <p className="text-[15px] font-semibold">
            {staffName} — {ymLabel(ym)} 급여 상세
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {employmentLabel ?? '직원'} · <PayModeBadge mode={computed.pay_mode} /> · 실근무{' '}
            {fmtHours(computed.work_minutes)}
          </p>
        </div>
        <button
          type="button"
          className="flex size-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_280px]">
        <div className="border-b border-border/40 p-5 md:border-b-0 md:border-r">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            출퇴근 기록 (실근무 기준)
          </p>
          {myRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">해당 기간 실근무 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    {['날짜', '출근', '퇴근', '실근무'].map((h) => (
                      <th
                        key={h}
                        className="pb-2 pr-4 text-left font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {myRows.map((r) => {
                    const mins = Math.round(
                      (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000,
                    )
                    return (
                      <tr key={r.id} className="border-b border-border/30">
                        <td className="py-2.5 pr-4 font-medium">{fmtDate(r.check_in)}</td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums">{fmtHm(r.check_in)}</td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums">{fmtHm(r.check_out)}</td>
                        <td className="py-2.5 font-mono tabular-nums">{fmtHours(mins)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-muted/20">
                    <td colSpan={3} className="py-2 pr-4 text-xs font-semibold text-muted-foreground">
                      합계
                    </td>
                    <td className="py-2 font-mono font-bold tabular-nums">
                      {fmtHours(totalMinutes)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            급여 계산 내역
          </p>

          <div className="space-y-0">
            <div className="flex items-center justify-between border-b border-border/40 py-2.5">
              <span className="text-sm text-muted-foreground">기본급</span>
              <span className="font-mono text-sm font-medium tabular-nums">
                {fmtWon(computed.base_pay)}
              </span>
            </div>
            {computed.pay_mode === 'salary' ? (
              <>
                <div className="flex items-center justify-between border-b border-border/40 py-2.5">
                  <span className="text-sm text-muted-foreground">상여</span>
                  <span className="font-mono text-sm font-medium tabular-nums">
                    {computed.bonus > 0 ? fmtWon(computed.bonus) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 py-2.5">
                  <div>
                    <span className="text-sm text-muted-foreground">월 휴무</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {computed.off_days_used}/{computed.off_days_required}
                    {computed.off_days_warning === 'shortage' && (
                      <span className="ml-1 text-destructive">⚠</span>
                    )}
                    {computed.off_days_warning === 'excess' && (
                      <span className="ml-1 text-sky-600">ℹ</span>
                    )}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border/40 py-2.5">
                  <div>
                    <span className="text-sm text-muted-foreground">주휴수당</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground/60">
                      (주평균 {avgWeekly.toFixed(1)}h)
                    </span>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-sm font-medium tabular-nums',
                      computed.allowances === 0 && 'text-muted-foreground',
                    )}
                  >
                    {computed.allowances > 0 ? fmtWon(computed.allowances) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-border/40 py-2.5">
                  <div>
                    <span className="text-sm text-muted-foreground">야간수당</span>
                    <span className="ml-1.5 text-[11px] text-muted-foreground/60">(미구현)</span>
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">—</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between pt-3">
              <span className="text-sm font-bold">최종 지급액</span>
              <span className="font-mono text-xl font-bold tabular-nums text-primary">
                {fmtWon(computed.total)}
              </span>
            </div>
          </div>

          {computed.pay_mode === 'hourly' ? (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              {computed.allowances > 0
                ? `📌 주평균 ${avgWeekly.toFixed(1)}h ≥ 15h → 주휴수당 발생\n※ 주휴수당 수식은 잠정 적용 중`
                : `📌 주평균 ${avgWeekly.toFixed(1)}h < 15h → 주휴수당 미발생`}
            </div>
          ) : computed.off_days_warning === 'shortage' ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive leading-relaxed">
              ⚠ 의무 휴무({computed.off_days_required}회) 미달 — 사장 수동 조정 검토 필요
            </div>
          ) : computed.off_days_warning === 'excess' ? (
            <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-[11px] text-sky-700 dark:text-sky-300 leading-relaxed">
              ℹ 의무 휴무({computed.off_days_required}회) 초과 — 정상이라면 무시 가능
            </div>
          ) : null}

          {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}

          <div className="mt-4 space-y-2">
            {!saved?.confirmed ? (
              <Button
                type="button"
                className="w-full"
                disabled={confirming || deleting || isPending}
                onClick={() => void handleConfirm()}
              >
                ✓ 급여 확정 (DB 저장)
              </Button>
            ) : (
              <Button type="button" className="w-full" variant="outline" disabled>
                ✓ 급여 확정 완료
              </Button>
            )}
            {saved ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-destructive hover:text-destructive"
                disabled={confirming || deleting}
                onClick={() => void handleDelete()}
              >
                기록 삭제
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export function PayrollPage() {
  const todayYm = (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })()

  const [ym, setYm] = useState(todayYm)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [confirmAllPending, setConfirmAllPending] = useState(false)
  /** 직원별 입력 중 상여금 (salary 모드, DB 저장 전 임시값) */
  const [bonusDraft, setBonusDraft] = useState<Record<string, string>>({})
  const detailRef = useRef<HTMLDivElement>(null)

  const period = useMemo(() => ymToPeriod(ym), [ym])

  const { data: staffList, isLoading: staffLoading } = useStaffList()
  const { data: store } = useStore()
  const { data: emplTypes } = useEmploymentTypes()
  const { data: payrollList, isLoading: payrollLoading } = usePayrollList(period.start)
  const { data: attendanceDetails = [], isLoading: detailLoading } =
    useAttendanceDetailsForPeriod(period.start, period.end)
  /** 월간 근무표(예정) — salary 직원 휴무 산출 소스. */
  const { data: monthCells } = useMonthCells(ym)

  /** staff_id → 이번 달 배정된 work_date set */
  const scheduledByStaff = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const c of monthCells ?? []) {
      if (!m.has(c.staff_id)) m.set(c.staff_id, new Set())
      m.get(c.staff_id)!.add(c.work_date)
    }
    return m
  }, [monthCells])

  const upsert = useUpsertPayroll()
  const del = useDeletePayroll()

  const isLoading = staffLoading || payrollLoading

  const typeById = useMemo(() => {
    const m = new Map<string, EmploymentTypeRow>()
    for (const t of emplTypes ?? []) m.set(t.id, t)
    return m
  }, [emplTypes])

  const savedByStaff = useMemo(() => {
    const m = new Map<string, PayrollRow>()
    for (const r of payrollList ?? []) m.set(r.staff_id, r)
    return m
  }, [payrollList])

  /** 직원별 급여 계산 결과 (calcPay 호출) */
  const payByStaff = useMemo(() => {
    const m = new Map<string, CalcPayResult>()
    for (const s of staffList ?? []) {
      const type = s.employment_type_id ? typeById.get(s.employment_type_id) ?? null : null
      const saved = savedByStaff.get(s.id)
      const draftStr = bonusDraft[s.id]
      const manualBonus =
        draftStr !== undefined
          ? parseFloat(draftStr.replace(/,/g, '')) || 0
          : saved?.bonus ?? 0
      const result = calcPay({
        staff: {
          id: s.id,
          hourly_rate: s.hourly_rate,
          base_salary: s.base_salary,
          monthly_off_days: s.monthly_off_days,
        },
        type,
        scheduledDates: scheduledByStaff.get(s.id) ?? new Set(),
        attendance: attendanceDetails.map((r) => ({
          staff_id: r.staff_id,
          check_in: r.check_in,
          check_out: r.check_out,
          is_baseline: false,
        })),
        period,
        manualBonus,
      })
      m.set(s.id, result)
    }
    return m
  }, [staffList, typeById, savedByStaff, bonusDraft, attendanceDetails, scheduledByStaff, period])

  /** 직원별 근무일수 — 실 출퇴근 기록의 distinct date count (인쇄 명세서용) */
  const workDaysByStaff = useMemo(() => {
    const m = new Map<string, number>()
    const setsByStaff = new Map<string, Set<string>>()
    for (const r of attendanceDetails) {
      if (!r.check_in || !r.check_out) continue
      const dateKey = String(r.check_in).slice(0, 10)
      if (!setsByStaff.has(r.staff_id)) setsByStaff.set(r.staff_id, new Set())
      setsByStaff.get(r.staff_id)!.add(dateKey)
    }
    for (const [sid, s] of setsByStaff) m.set(sid, s.size)
    return m
  }, [attendanceDetails])

  /** 요약 통계 */
  const { totalLabor, confirmedCount, pendingCount } = useMemo(() => {
    let totalLabor = 0
    let confirmedCount = 0
    let pendingCount = 0
    for (const s of staffList ?? []) {
      const saved = savedByStaff.get(s.id)
      const computed = payByStaff.get(s.id)
      if (!computed) continue
      const hasWork = computed.work_minutes > 0 || computed.pay_mode === 'salary'
      if (!hasWork && !saved) continue
      const pay = saved?.total ?? computed.total
      totalLabor += pay
      if (saved?.confirmed) confirmedCount++
      else if (saved || hasWork) pendingCount++
    }
    return { totalLabor, confirmedCount, pendingCount }
  }, [staffList, savedByStaff, payByStaff])

  async function handleConfirm(staffId: string, confirmed: boolean) {
    const computed = payByStaff.get(staffId)
    if (!computed) return
    await upsert.mutateAsync({
      staffId,
      periodStart: period.start,
      periodEnd: period.end,
      payMode: computed.pay_mode,
      basePay: computed.base_pay,
      bonus: computed.bonus,
      allowances: computed.allowances,
      deductions: computed.deductions,
      workMinutes: computed.work_minutes,
      offDaysUsed: computed.off_days_used,
      offDaysRequired: computed.off_days_required,
      offDaysWarning: computed.off_days_warning,
      confirmed,
    })
  }

  async function handleConfirmAll() {
    const pending = (staffList ?? []).filter((s) => {
      const computed = payByStaff.get(s.id)
      const saved = savedByStaff.get(s.id)
      if (!computed || saved?.confirmed) return false
      return computed.work_minutes > 0 || computed.pay_mode === 'salary'
    })
    if (pending.length === 0) {
      window.alert('확정할 미정산 직원이 없습니다.')
      return
    }
    if (!window.confirm(`미정산 ${pending.length}명의 급여를 전체 확정하시겠습니까?`)) return
    setConfirmAllPending(true)
    try {
      for (const s of pending) await handleConfirm(s.id, true)
    } catch (e) {
      window.alert(`전체 확정 중 오류가 발생했습니다. ${getPostgrestMessage(e)}`)
    } finally {
      setConfirmAllPending(false)
    }
  }

  function toggleDetail(staffId: string) {
    setSelectedStaffId((prev) => (prev === staffId ? null : staffId))
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
  }

  const th = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50'
  const td = 'px-4 py-3 align-middle text-sm'
  const mono = 'font-mono tabular-nums'

  return (
    <div className="space-y-5">
      {/* ── 기간 바 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted"
            onClick={() => { setYm(addMonth(ym, -1)); setSelectedStaffId(null); setBonusDraft({}) }}
          >
            ‹
          </button>
          <div>
            <p className="text-xl font-bold tracking-tight">{ymLabel(ym)}</p>
            <p className="text-xs text-muted-foreground">
              {period.start} ~ {period.end}
            </p>
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
            disabled={ym >= todayYm}
            onClick={() => { setYm(addMonth(ym, 1)); setSelectedStaffId(null); setBonusDraft({}) }}
          >
            ›
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            📄 전체 명세서 출력
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={confirmAllPending || upsert.isPending}
            onClick={() => void handleConfirmAll()}
          >
            ✓ 전체 급여 확정
          </Button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="이번 달 총 인건비"
          value={totalLabor > 0 ? Math.round(totalLabor).toLocaleString() : '—'}
          sub={totalLabor > 0 ? '원' : undefined}
          accent
        />
        <SummaryCard
          label="총 직원 수"
          value={String(staffList?.length ?? 0)}
          sub={`근무자 ${staffList?.length ?? 0}명`}
        />
        <SummaryCard label="정산 완료" value={String(confirmedCount)} sub="확정됨" />
        <SummaryCard
          label="미정산"
          value={String(pendingCount)}
          sub={pendingCount > 0 ? '검토 필요' : '없음'}
        />
      </div>

      {/* ── 통합 표 ── */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[15px] font-semibold">직원별 급여 현황</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              월급제 직원은 상여를 인라인 편집, 휴무 사용/의무를 표시합니다. 행 클릭 시 상세
              패널.
            </p>
          </div>
        </div>

        {isLoading ? (
          <AuthLoading />
        ) : !staffList?.length ? (
          <p className="text-sm text-muted-foreground">등록된 직원이 없습니다.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse">
                <thead>
                  <tr className="bg-muted/40">
                    <th className={th}>직원</th>
                    <th className={th}>계산</th>
                    <th className={`${th} text-right`}>기본급 / 시급×시간</th>
                    <th className={`${th} text-right`}>상여</th>
                    <th className={`${th} text-right`}>수당·휴무</th>
                    <th className={`${th} text-right`}>합계</th>
                    <th className={th}>상태</th>
                    <th className={`${th} text-right`}>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((s) => {
                    const computed = payByStaff.get(s.id)
                    const saved = savedByStaff.get(s.id)
                    const isSelected = selectedStaffId === s.id
                    if (!computed) return null
                    const isSalary = computed.pay_mode === 'salary'
                    const draftVal =
                      bonusDraft[s.id] !== undefined
                        ? bonusDraft[s.id]
                        : saved?.bonus
                          ? String(saved.bonus)
                          : ''
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          'cursor-pointer border-b border-border/40 transition-colors last:border-b-0',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                        )}
                        onClick={() => toggleDetail(s.id)}
                      >
                        <td className={td}>
                          <div className="flex items-center gap-2.5">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                              {s.name[0]}
                            </div>
                            <div>
                              <p className="font-medium">{s.name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {s.employment_label ?? '—'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={td}>
                          <PayModeBadge mode={computed.pay_mode} />
                        </td>
                        <td className={`${td} ${mono} text-right`}>
                          {isSalary ? (
                            computed.base_pay > 0 ? (
                              fmtWon(computed.base_pay)
                            ) : (
                              <span className="text-muted-foreground">미설정</span>
                            )
                          ) : computed.work_minutes > 0 ? (
                            <div>
                              <div>{fmtWon(computed.base_pay)}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {fmtHours(computed.work_minutes)} × {fmtWon(s.hourly_rate)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                          {isSalary ? (
                            <Input
                              inputMode="decimal"
                              placeholder="0"
                              className="h-8 w-[100px] ml-auto text-right font-mono text-xs tabular-nums"
                              value={draftVal}
                              disabled={Boolean(saved?.confirmed)}
                              onChange={(e) =>
                                setBonusDraft((prev) => ({ ...prev, [s.id]: e.target.value }))
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`${td} ${mono} text-right`}>
                          {isSalary ? (
                            <span>
                              {computed.off_days_used}/{computed.off_days_required}
                              {computed.off_days_warning === 'shortage' && (
                                <span className="ml-1 text-destructive">⚠</span>
                              )}
                              {computed.off_days_warning === 'excess' && (
                                <span className="ml-1 text-sky-600">ℹ</span>
                              )}
                            </span>
                          ) : computed.allowances > 0 ? (
                            <div>
                              <div>{fmtWon(computed.allowances)}</div>
                              <div className="text-[11px] text-muted-foreground">주휴(잠정)</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`${td} ${mono} text-right font-semibold`}>
                          {computed.total > 0 ? (
                            fmtWon(computed.total)
                          ) : (
                            <span className="font-normal text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={td}>
                          <StatusBadge
                            confirmed={saved?.confirmed ?? false}
                            hasSaved={Boolean(saved)}
                          />
                        </td>
                        <td className={td}>
                          <div
                            className="flex justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!saved?.confirmed &&
                            (computed.work_minutes > 0 || isSalary) ? (
                              <button
                                type="button"
                                className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                disabled={upsert.isPending}
                                onClick={() => void handleConfirm(s.id, true)}
                              >
                                확정
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── 상세 패널 ── */}
      {selectedStaffId ? (
        <div ref={detailRef}>
          {detailLoading ? (
            <AuthLoading />
          ) : (
            (() => {
              const s = staffList?.find((x) => x.id === selectedStaffId)
              const computed = payByStaff.get(selectedStaffId)
              const saved = savedByStaff.get(selectedStaffId)
              if (!s || !computed) return null
              return (
                <DetailPanel
                  staffName={s.name}
                  employmentLabel={s.employment_label}
                  computed={{ ...computed, staffId: s.id }}
                  saved={saved}
                  attendanceRows={attendanceDetails}
                  ym={ym}
                  onConfirm={handleConfirm}
                  onDelete={async (id) => {
                    await del.mutateAsync(id)
                    setSelectedStaffId(null)
                  }}
                  onClose={() => setSelectedStaffId(null)}
                  isPending={upsert.isPending}
                />
              )
            })()
          )}
        </div>
      ) : null}

      {/* ── 미결 안내 ── */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground print:hidden">
        <p className="font-medium text-amber-700 dark:text-amber-400">미결 사항</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>주휴수당: 주 15h 이상 시 잠정 수식 — salary 모드는 기본급 포함 가정으로 스킵</li>
          <li>야간수당: 22:00~06:00 구간 집계 미구현</li>
          <li>휴무 미달/초과: 표시·경고만, 자동 감액 없음 (사장 수동 조정)</li>
          <li>급여 명세서 PDF/이미지 출력 방식 미결</li>
        </ul>
      </div>

      {/* ── 인쇄 전용 시트 — 「전체 명세서 출력」 시 노출 ── */}
      <PayrollPrintSheet
        storeName={store?.name ?? '내 매장'}
        storeBusinessNo={store?.business_no ?? null}
        storeOwnerName={store?.owner_name ?? null}
        storeAddress={store?.address ?? null}
        storePhone={store?.phone ?? null}
        ymLabel={ymLabel(ym)}
        periodStart={period.start}
        periodEnd={period.end}
        rows={(staffList ?? []).map((s) => {
          const type = s.employment_type_id ? typeById.get(s.employment_type_id) : null
          const c = payByStaff.get(s.id)
          return {
            id: s.id,
            name: s.name,
            employmentLabel: type?.label ?? '직원',
            payMode: c?.pay_mode ?? 'hourly',
            hourlyRate: s.hourly_rate,
            workDays: workDaysByStaff.get(s.id) ?? 0,
            workMinutes: c?.work_minutes ?? 0,
            basePay: c?.base_pay ?? 0,
            bonus: c?.bonus ?? 0,
            allowances: c?.allowances ?? 0,
            total: c?.total ?? 0,
          }
        })}
      />
    </div>
  )
}

// ─── 인쇄 전용 통합 명세서 시트 ──────────────────────────────────────────────
// 화면에서는 숨김(`hidden print:block`). 헤더의 「📄 전체 명세서 출력」 버튼이
// `window.print()`를 호출하면 이 시트만 인쇄됨 (다른 요소는 `print:hidden`).
// ─────────────────────────────────────────────────────────────────────────

type PayrollPrintRow = {
  id: string
  name: string
  employmentLabel: string
  payMode: 'hourly' | 'salary'
  hourlyRate: number
  workDays: number
  workMinutes: number
  basePay: number
  bonus: number
  allowances: number
  total: number
}

function PayrollPrintSheet({
  storeName,
  storeBusinessNo,
  storeOwnerName,
  storeAddress,
  storePhone,
  ymLabel,
  periodStart,
  periodEnd,
  rows,
}: {
  storeName: string
  storeBusinessNo: string | null
  storeOwnerName: string | null
  storeAddress: string | null
  storePhone: string | null
  ymLabel: string
  periodStart: string
  periodEnd: string
  rows: PayrollPrintRow[]
}) {
  const printableRows = rows.filter(
    (r) => r.workMinutes > 0 || r.payMode === 'salary' || r.total > 0,
  )
  const totalLabor = printableRows.reduce((sum, r) => sum + r.total, 0)
  const fmt = (n: number) => (n > 0 ? Math.round(n).toLocaleString() : '—')
  const hmm = (mins: number) => {
    if (mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }

  return (
    <div className="print-sheet hidden bg-white p-4 text-black print:block">
      {/* 헤더 — 매장 정보 + 지급기간 */}
      <div className="mb-3 border-b-2 border-black pb-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold tracking-tight">{storeName} — 급여 통합 명세서</h1>
          <p className="text-xs tabular-nums">출력일: {new Date().toISOString().slice(0, 10)}</p>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[10.5px]">
          <p>
            <span className="text-gray-600">지급기간:</span> {periodStart} ~ {periodEnd} ({ymLabel})
          </p>
          <p>
            <span className="text-gray-600">직원 수:</span> {printableRows.length}명
          </p>
          {storeBusinessNo ? (
            <p>
              <span className="text-gray-600">사업자번호:</span> {storeBusinessNo}
            </p>
          ) : null}
          {storeOwnerName ? (
            <p>
              <span className="text-gray-600">대표자:</span> {storeOwnerName}
            </p>
          ) : null}
          {storeAddress ? (
            <p className="col-span-2">
              <span className="text-gray-600">주소:</span> {storeAddress}
            </p>
          ) : null}
          {storePhone ? (
            <p>
              <span className="text-gray-600">연락처:</span> {storePhone}
            </p>
          ) : null}
        </div>
      </div>

      {/* 표 */}
      <table className="w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="border-b-2 border-black bg-gray-100">
            <th className="border-r border-gray-400 px-1 py-1.5 text-center font-semibold">#</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-left font-semibold">직원명</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-left font-semibold">근무유형</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-left font-semibold">지급방식</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-right font-semibold">시급</th>
            <th className="border-r border-gray-400 px-1 py-1.5 text-right font-semibold">일수</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-right font-semibold">실근무</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-right font-semibold">기본급</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-right font-semibold">상여</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-right font-semibold">주휴수당</th>
            <th className="border-r border-gray-400 px-1.5 py-1.5 text-right font-semibold text-gray-500">
              야간수당
            </th>
            <th className="px-1.5 py-1.5 text-right font-bold">지급액</th>
          </tr>
        </thead>
        <tbody>
          {printableRows.length === 0 ? (
            <tr>
              <td colSpan={12} className="py-4 text-center text-gray-500">
                해당 기간의 급여 데이터가 없습니다.
              </td>
            </tr>
          ) : (
            printableRows.map((r, i) => (
              <tr key={r.id} className="border-b border-gray-300">
                <td className="border-r border-gray-300 px-1 py-1.5 text-center tabular-nums text-gray-600">
                  {i + 1}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 font-medium">{r.name}</td>
                <td className="border-r border-gray-300 px-1.5 py-1.5">{r.employmentLabel}</td>
                <td className="border-r border-gray-300 px-1.5 py-1.5">
                  {r.payMode === 'salary' ? '월급제' : '시급제'}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 text-right tabular-nums">
                  {r.payMode === 'hourly' ? r.hourlyRate.toLocaleString() : '—'}
                </td>
                <td className="border-r border-gray-300 px-1 py-1.5 text-right tabular-nums">
                  {r.workDays > 0 ? `${r.workDays}일` : '—'}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 text-right tabular-nums">
                  {hmm(r.workMinutes)}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 text-right tabular-nums">
                  {fmt(r.basePay)}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 text-right tabular-nums">
                  {fmt(r.bonus)}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 text-right tabular-nums">
                  {fmt(r.allowances)}
                </td>
                <td className="border-r border-gray-300 px-1.5 py-1.5 text-right tabular-nums text-gray-500">
                  —
                </td>
                <td className="px-1.5 py-1.5 text-right tabular-nums font-bold">{fmt(r.total)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black bg-gray-50">
            <td colSpan={11} className="px-2 py-2 text-right text-[11px] font-semibold">
              총 인건비
            </td>
            <td className="px-1.5 py-2 text-right text-[12px] font-bold tabular-nums">
              ₩ {fmt(totalLabor)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-3 text-[9px] text-gray-500">
        * 단위: 원 (KRW). 세금·4대보험 공제 전 지급액 기준. 「야간수당」 칸은 미구현으로 「—」 처리.
      </p>
    </div>
  )
}
