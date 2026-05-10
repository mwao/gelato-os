import { useMemo, useRef, useState } from 'react'
import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DOW_KO } from '@/lib/dateUtils'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import { useStaffList } from '@/hooks/useStaff'
import {
  usePayrollList,
  useAttendanceWorkSummary,
  useAttendanceDetailsForPeriod,
  useUpsertPayroll,
  useDeletePayroll,
  type PayrollRow,
  type AttendancePeriodRecord,
} from '@/hooks/usePayroll'

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

/** 주휴수당 계산 — 월 실근무시간 기준 주평균 15h 이상 시 발생 (미결 사항: 수식 잠정 적용). */
function calcHolidayPay(workMinutes: number, hourlyRate: number): number {
  const totalHours = workMinutes / 60
  const avgWeekly = totalHours / 4
  if (avgWeekly < 15) return 0
  return Math.round(avgWeekly * hourlyRate)
}

// ─── 타입 ────────────────────────────────────────────────────────────────────

type PayComputed = {
  staffId: string
  staffName: string
  employmentLabel: string | null
  hourlyRate: number
  workMinutes: number
  basePay: number
  holidayPay: number
  nightPay: number
  total: number
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

// ─── 상태 뱃지 ────────────────────────────────────────────────────────────────

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

// ─── 상세 패널 ────────────────────────────────────────────────────────────────

function DetailPanel({
  computed,
  saved,
  attendanceRows,
  ym,
  onConfirm,
  onDelete,
  onClose,
  isPending,
}: {
  computed: PayComputed
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

  const avgWeekly = computed.workMinutes / 60 / 4

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
    if (!window.confirm(`${computed.staffName}의 급여 기록을 삭제할까요?`)) return
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
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-6 py-4 rounded-t-xl">
        <div>
          <p className="text-[15px] font-semibold">
            {computed.staffName} — {ymLabel(ym)} 급여 상세
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {computed.employmentLabel ?? '직원'} · 시급 {fmtWon(computed.hourlyRate)} · 실근무{' '}
            {fmtHours(computed.workMinutes)}
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

      {/* 바디 */}
      <div className="grid gap-0 md:grid-cols-[1fr_280px]">
        {/* 왼쪽: 출퇴근 기록 */}
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
                    const mins =
                      r.check_out
                        ? Math.round(
                            (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) /
                              60000,
                          )
                        : 0
                    return (
                      <tr key={r.id} className="border-b border-border/30">
                        <td className="py-2.5 pr-4 font-medium">{fmtDate(r.check_in)}</td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums">{fmtHm(r.check_in)}</td>
                        <td className="py-2.5 pr-4 font-mono tabular-nums">
                          {r.check_out ? fmtHm(r.check_out) : '—'}
                        </td>
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

        {/* 오른쪽: 급여 계산 내역 */}
        <div className="p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            급여 계산 내역
          </p>

          <div className="space-y-0">
            <div className="flex items-center justify-between border-b border-border/40 py-2.5">
              <div>
                <span className="text-sm text-muted-foreground">기본급</span>
                <span className="ml-1.5 text-[11px] text-muted-foreground/60">
                  ({fmtHours(computed.workMinutes)} × {fmtWon(computed.hourlyRate)})
                </span>
              </div>
              <span className="font-mono text-sm font-medium tabular-nums">
                {fmtWon(computed.basePay)}
              </span>
            </div>
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
                  computed.holidayPay === 0 && 'text-muted-foreground',
                )}
              >
                {computed.holidayPay > 0 ? fmtWon(computed.holidayPay) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border/40 py-2.5">
              <div>
                <span className="text-sm text-muted-foreground">야간수당</span>
                <span className="ml-1.5 text-[11px] text-muted-foreground/60">(22시 이후)</span>
              </div>
              <span className="font-mono text-sm text-muted-foreground">—</span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-sm font-bold">최종 지급액</span>
              <span className="font-mono text-xl font-bold tabular-nums text-primary">
                {fmtWon(computed.total)}
              </span>
            </div>
          </div>

          {/* 주휴수당 안내 */}
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
            {computed.holidayPay > 0
              ? `📌 주평균 근무 ${avgWeekly.toFixed(1)}h ≥ 15h → 주휴수당 발생\n※ 주휴수당 수식은 잠정 적용 중 — 확정 전 검토 권장`
              : `📌 주평균 근무 ${avgWeekly.toFixed(1)}h < 15h → 주휴수당 미발생`}
          </div>

          {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}

          {/* 액션 */}
          <div className="mt-4 space-y-2">
            {!saved?.confirmed ? (
              <Button
                type="button"
                className="w-full"
                disabled={confirming || deleting || isPending || computed.workMinutes === 0}
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
  const detailRef = useRef<HTMLDivElement>(null)

  const period = useMemo(() => ymToPeriod(ym), [ym])

  const { data: staffList, isLoading: staffLoading } = useStaffList()
  const { data: payrollList, isLoading: payrollLoading } = usePayrollList(period.start)
  const { data: workSummary, isLoading: summaryLoading } = useAttendanceWorkSummary(
    period.start,
    period.end,
  )
  const { data: attendanceDetails = [], isLoading: detailLoading } =
    useAttendanceDetailsForPeriod(period.start, period.end)

  const upsert = useUpsertPayroll()
  const del = useDeletePayroll()

  const isLoading = staffLoading || payrollLoading || summaryLoading

  const savedByStaff = useMemo(() => {
    const m = new Map<string, PayrollRow>()
    for (const r of payrollList ?? []) m.set(r.staff_id, r)
    return m
  }, [payrollList])

  /** 직원별 급여 계산 결과 */
  const payByStaff = useMemo((): Map<string, PayComputed> => {
    const m = new Map<string, PayComputed>()
    for (const s of staffList ?? []) {
      const workMinutes = workSummary?.get(s.id) ?? 0
      const basePay = Math.round((workMinutes / 60) * s.hourly_rate)
      const holidayPay = calcHolidayPay(workMinutes, s.hourly_rate)
      const nightPay = 0
      m.set(s.id, {
        staffId: s.id,
        staffName: s.name,
        employmentLabel: s.employment_label,
        hourlyRate: s.hourly_rate,
        workMinutes,
        basePay,
        holidayPay,
        nightPay,
        total: basePay + holidayPay + nightPay,
      })
    }
    return m
  }, [staffList, workSummary])

  /** 요약 통계 */
  const { totalLabor, confirmedCount, pendingCount } = useMemo(() => {
    let totalLabor = 0
    let confirmedCount = 0
    let pendingCount = 0
    for (const s of staffList ?? []) {
      const saved = savedByStaff.get(s.id)
      const computed = payByStaff.get(s.id)
      if (!computed || computed.workMinutes === 0) continue
      const pay = saved?.total ?? computed.total
      totalLabor += pay
      if (saved?.confirmed) confirmedCount++
      else pendingCount++
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
      basePay: computed.basePay,
      allowances: computed.holidayPay,
      deductions: 0,
      workMinutes: computed.workMinutes,
      confirmed,
    })
  }

  async function handleConfirmAll() {
    const pending = (staffList ?? []).filter((s) => {
      const computed = payByStaff.get(s.id)
      const saved = savedByStaff.get(s.id)
      return computed && computed.workMinutes > 0 && !saved?.confirmed
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
            onClick={() => { setYm(addMonth(ym, -1)); setSelectedStaffId(null) }}
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
            onClick={() => { setYm(addMonth(ym, 1)); setSelectedStaffId(null) }}
          >
            ›
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.alert('급여 명세서 PDF 출력은 미구현 (미결 사항) — 추후 지원 예정입니다.')}
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

      {/* ── 요약 카드 4종 ── */}
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
        <SummaryCard
          label="정산 완료"
          value={String(confirmedCount)}
          sub="확정됨"
        />
        <SummaryCard
          label="미정산"
          value={String(pendingCount)}
          sub={pendingCount > 0 ? '검토 필요' : '없음'}
        />
      </div>

      {/* ── 직원별 급여 표 ── */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[15px] font-semibold">직원별 급여 현황</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              행을 클릭하면 출퇴근 내역과 급여 계산 내역을 확인할 수 있습니다.
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
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="bg-muted/40">
                    <th className={th}>직원</th>
                    <th className={`${th} text-right`}>실근무시간</th>
                    <th className={`${th} text-right`}>시급</th>
                    <th className={`${th} text-right`}>기본급</th>
                    <th className={`${th} text-right`}>주휴수당</th>
                    <th className={`${th} text-right`}>야간수당</th>
                    <th className={`${th} text-right`}>총액</th>
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
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          'cursor-pointer border-b border-border/40 transition-colors last:border-b-0',
                          isSelected
                            ? 'bg-primary/5'
                            : 'hover:bg-muted/30',
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
                        <td className={`${td} ${mono} text-right`}>
                          {computed.workMinutes > 0 ? (
                            fmtHours(computed.workMinutes)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`${td} ${mono} text-right text-muted-foreground`}>
                          {fmtWon(s.hourly_rate)}
                        </td>
                        <td className={`${td} ${mono} text-right`}>
                          {computed.basePay > 0 ? (
                            fmtWon(computed.basePay)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`${td} ${mono} text-right`}>
                          {computed.holidayPay > 0 ? (
                            fmtWon(computed.holidayPay)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={`${td} ${mono} text-right text-muted-foreground`}>—</td>
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
                            <button
                              type="button"
                              className="rounded-md border border-border/60 bg-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                              onClick={() =>
                                window.alert('급여 명세서 출력은 미구현 (추후 지원 예정).')
                              }
                            >
                              명세서
                            </button>
                            {!saved?.confirmed && computed.workMinutes > 0 ? (
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
              const computed = payByStaff.get(selectedStaffId)
              const saved = savedByStaff.get(selectedStaffId)
              if (!computed) return null
              return (
                <DetailPanel
                  computed={computed}
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
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-amber-700 dark:text-amber-400">미결 사항</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>주휴수당: 주 15h 이상 시 월평균 주 시간 × 시급 잠정 적용 (근로기준법 수식 정교화 예정)</li>
          <li>야간수당: 22:00~06:00 구간 집계 미구현</li>
          <li>급여 명세서 PDF/이미지 출력 방식 미결</li>
        </ul>
      </div>

    </div>
  )
}
