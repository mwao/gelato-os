import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAttendanceList } from '@/hooks/useAttendance'
import { useMonthCellsDateRange } from '@/hooks/useMonthSchedule'
import { usePayrollList } from '@/hooks/usePayroll'
import { useShiftTimeSettings } from '@/hooks/useShiftSettings'
import { useStaffList } from '@/hooks/useStaff'
import { useStore } from '@/hooks/useStore'
import { useStoreTasks, type StoreTaskRow } from '@/hooks/useStoreTasks'
import {
  useStoreTaskReports,
  type StoreTaskReportRow,
} from '@/hooks/useStoreTaskReports'
import { groupAttendanceByDateStaff } from '@/lib/attendanceDisplay'
import {
  addDaysLocal,
  formatYmdLocal,
  startOfIsoWeekMonday,
} from '@/lib/dateUtils'
import { plannedFromMonthCells } from '@/lib/plannedFromWeek'
import { supabase } from '@/lib/supabase'
import { isTaskDueOnDate, ymdLocal } from '@/lib/taskRecurrence'
import { cn } from '@/lib/utils'

function hmToMinutes(hm: string | undefined): number | null {
  if (!hm) return null
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10))
  if (Number.isNaN(h)) return null
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

function isoToMinutes(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function fmtWon(n: number): string {
  return n.toLocaleString()
}

function ymToFirstDay(ym: string): string {
  return `${ym}-01`
}

export function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: store, isLoading, isError, error, refetch } = useStore()

  async function handleSignOut() {
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  if (isLoading) return <AuthLoading />

  if (isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">
              매장 정보를 불러오지 못했습니다
            </CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : String(error)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
            <Button type="button" variant="ghost" onClick={handleSignOut}>
              로그아웃
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 환영 헤더 */}
      <WelcomeHeader storeName={store?.name ?? '내 매장'} />

      {/* 빠른 액션 chip row */}
      <QuickActions />

      {/* 「할 일」 알림 — 매장 정보 미입력·계정 미발급·미정산·미출근 */}
      <TodoAlertsCard />

      {/* 오늘 근무·업무 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TodayAttendanceCard />
        <TodayTasksCard />
      </div>

      {/* 이번 달 인건비 + 이번 주 출퇴근 KPI */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MonthPayrollCard />
        <WeekKpiCard />
      </div>
    </div>
  )
}

function WelcomeHeader({ storeName }: { storeName: string }) {
  const now = new Date()
  const dow = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()]
  const dateLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} (${dow})`
  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-xl font-bold tracking-tight">
            {storeName} 대시보드
          </CardTitle>
          <span className="text-sm tabular-nums text-muted-foreground">
            {dateLabel}
          </span>
        </div>
        <CardDescription className="text-sm leading-relaxed">
          오늘 매장 운영 현황·이번 주/달 지표·놓치고 있는 할 일을 한눈에 확인합니다.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function QuickActions() {
  const items: { to: string; icon: string; label: string }[] = [
    { to: '/staff/attendance', icon: '⏰', label: '출퇴근' },
    { to: '/staff/schedule', icon: '🗓️', label: '근무표' },
    { to: '/tasks', icon: '📋', label: '업무 관리' },
    { to: '/payroll', icon: '💰', label: '급여 정산' },
    { to: '/staff/profile', icon: '👤', label: '직원' },
    { to: '/my', icon: '🏪', label: '매장 정보' },
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-border/30',
            'transition-all duration-150 hover:bg-muted/45 hover:ring-border/45 active:scale-[0.98]',
          )}
        >
          <span aria-hidden>{it.icon}</span>
          {it.label}
        </Link>
      ))}
    </div>
  )
}

function TodoAlertsCard() {
  const { data: store } = useStore()
  const { data: staffList } = useStaffList()
  const todayKey = ymdLocal(new Date())
  const monthYm = todayKey.slice(0, 7)
  const { data: payrollList } = usePayrollList(ymToFirstDay(monthYm))
  const { data: todayRows } = useAttendanceList({
    from: todayKey,
    to: todayKey,
  })
  const { data: monthCells } = useMonthCellsDateRange(todayKey, todayKey)
  const { data: shiftStore } = useShiftTimeSettings()

  const plannedMap = plannedFromMonthCells(
    monthCells ?? [],
    shiftStore?.store ?? null,
  )
  const grouped = groupAttendanceByDateStaff(todayRows ?? [])
  const todayGroup = grouped.find((g) => g.dateKey === todayKey)

  // 미출근 직원 (예정 있음 + 출근 안 함, 매장 영업 시간 시작 후만)
  const noShowStaff: string[] = []
  for (const s of staffList ?? []) {
    const planned = plannedMap.get(`${s.id}_${todayKey}`)
    if (!planned) continue
    const block = todayGroup?.blocks.find((b) => b.staff_id === s.id)
    if (block?.actual?.check_in) continue
    // 예정 시작 시각이 현재 시각보다 이전이면 미출근으로 판단
    const plannedStart = hmToMinutes(planned.startHm)
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    if (plannedStart != null && plannedStart <= nowMin) {
      noShowStaff.push(s.name)
    }
  }

  // 미정산 (이번 달)
  const totalStaff = staffList?.length ?? 0
  const confirmedCount = (payrollList ?? []).filter((p) => p.confirmed).length
  const pendingPayroll =
    totalStaff > 0 ? Math.max(0, totalStaff - confirmedCount) : 0

  // 매장 정보 미입력
  const missingStoreInfo: string[] = []
  if (!store?.business_no) missingStoreInfo.push('사업자번호')
  if (!store?.owner_name) missingStoreInfo.push('대표자명')

  // 매장 계정 미발급
  const noStoreAccount = !store?.store_account_user_id

  type Alert = { icon: string; text: string; to: string }
  const alerts: Alert[] = []

  if (noShowStaff.length > 0) {
    alerts.push({
      icon: '⚠',
      text: `미출근 ${noShowStaff.length}명 — ${noShowStaff.slice(0, 3).join(', ')}${noShowStaff.length > 3 ? ' 외' : ''}`,
      to: '/staff/attendance',
    })
  }
  if (missingStoreInfo.length > 0) {
    alerts.push({
      icon: '📋',
      text: `매장 정보 미입력 — ${missingStoreInfo.join(', ')} (명세서 출력에 필요)`,
      to: '/my',
    })
  }
  if (noStoreAccount) {
    alerts.push({
      icon: '🏪',
      text: '매장 계정이 발급되지 않았습니다 — 매장 단말에서 출퇴근·업무 사용 불가',
      to: '/my',
    })
  }
  if (pendingPayroll > 0) {
    alerts.push({
      icon: '💰',
      text: `이번 달 미정산 ${pendingPayroll}명`,
      to: '/payroll',
    })
  }

  if (alerts.length === 0) {
    return (
      <Card className="rounded-2xl border-border/45 bg-emerald-500/[0.04] shadow-sm ring-1 ring-emerald-500/20">
        <CardContent className="flex items-center gap-2 py-3">
          <span className="text-lg" aria-hidden>
            ✓
          </span>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            오늘 챙겨야 할 알림이 없습니다. 좋은 하루 보내세요!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl border-border/45 bg-amber-500/[0.04] shadow-md ring-1 ring-amber-500/25">
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">
            ⚠ 오늘 챙겨야 할 일 ({alerts.length}건)
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pb-4">
        {alerts.map((a, i) => (
          <Link
            key={i}
            to={a.to}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
              'hover:bg-amber-500/[0.08]',
            )}
          >
            <span aria-hidden className="shrink-0">
              {a.icon}
            </span>
            <span className="flex-1 truncate">{a.text}</span>
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

function TodayAttendanceCard() {
  const todayKey = ymdLocal(new Date())
  const { data: staffList } = useStaffList()
  const { data: todayRows } = useAttendanceList({
    from: todayKey,
    to: todayKey,
  })
  const { data: monthCells } = useMonthCellsDateRange(todayKey, todayKey)
  const { data: shiftStore } = useShiftTimeSettings()

  const plannedMap = plannedFromMonthCells(
    monthCells ?? [],
    shiftStore?.store ?? null,
  )
  const grouped = groupAttendanceByDateStaff(todayRows ?? [])
  const todayGroup = grouped.find((g) => g.dateKey === todayKey)

  let working = 0
  let done = 0
  let pending = 0
  let off = 0
  let late = 0
  const noShowNames: string[] = []
  for (const s of staffList ?? []) {
    const p = plannedMap.get(`${s.id}_${todayKey}`)
    const block = todayGroup?.blocks.find((b) => b.staff_id === s.id)
    const aIn = block?.actual?.check_in ?? null
    const aOut = block?.actual?.check_out ?? null
    if (!p) {
      off++
      continue
    }
    if (aIn && aOut) done++
    else if (aIn) working++
    else {
      pending++
      noShowNames.push(s.name)
    }
    if (aIn && p.startHm) {
      const pm = hmToMinutes(p.startHm)
      const am = isoToMinutes(aIn)
      if (pm != null && am != null && am - pm > 0) late++
    }
  }

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">
            ⏰ 오늘 출퇴근 현황
          </CardTitle>
          <Link
            to="/staff/attendance"
            className="text-[12px] font-medium text-primary hover:underline"
          >
            상세 →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiTile label="근무중" value={working} accent="emerald" />
          <KpiTile label="근무종료" value={done} accent="slate" />
          <KpiTile label="미출근" value={pending} accent="amber" />
          <KpiTile label="휴무" value={off} accent="muted" />
        </div>
        {late > 0 ? (
          <p className="text-xs text-destructive">⚠ 지각 {late}건</p>
        ) : null}
        {noShowNames.length > 0 ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            미출근:{' '}
            <span className="font-medium text-foreground">
              {noShowNames.slice(0, 5).join(', ')}
              {noShowNames.length > 5 ? ' 외' : ''}
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TodayTasksCard() {
  const todayKey = ymdLocal(new Date())
  const { data: tasks } = useStoreTasks()
  const { data: reports } = useStoreTaskReports(todayKey)
  const { data: staffList } = useStaffList()

  const today = new Date()
  const dueTasks = (tasks ?? []).filter((t) => isTaskDueOnDate(t, today))

  const reportsByTask = new Map<string, StoreTaskReportRow[]>()
  for (const r of reports ?? []) {
    if (!reportsByTask.has(r.task_id)) reportsByTask.set(r.task_id, [])
    reportsByTask.get(r.task_id)!.push(r)
  }

  const staffNameById = new Map<string, string>()
  for (const s of staffList ?? []) staffNameById.set(s.id, s.name)

  /** 업무를 완료시킨 첫 보고 (체크=checked, 사진=photo 추가, 메모=내용 입력) */
  function findCompletingReport(t: StoreTaskRow): StoreTaskReportRow | null {
    const rs = reportsByTask.get(t.id) ?? []
    const match = (r: StoreTaskReportRow): boolean => {
      switch (t.report_type) {
        case 'check':
          return r.checked === true
        case 'photo':
          return r.photo_urls.length > 0
        case 'memo':
          return (r.memo ?? '').trim().length > 0
      }
    }
    return rs.find(match) ?? null
  }

  const total = dueTasks.length

  // task별 status row
  const taskRows = dueTasks.map((t) => {
    const completing = findCompletingReport(t)
    return {
      task: t,
      done: Boolean(completing),
      reporterName: completing
        ? (staffNameById.get(completing.staff_id) ?? '?')
        : null,
      completedAt: completing?.reported_at ?? null,
    }
  })
  // 정렬: 미완료 먼저, 완료는 시간 이른 순
  taskRows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.completedAt && b.completedAt)
      return a.completedAt.localeCompare(b.completedAt)
    return 0
  })

  const completed = taskRows.filter((r) => r.done).length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

  // 보고 방식별
  const breakdown = {
    check: { total: 0, done: 0 },
    photo: { total: 0, done: 0 },
    memo: { total: 0, done: 0 },
  } as Record<'check' | 'photo' | 'memo', { total: number; done: number }>
  for (const r of taskRows) {
    breakdown[r.task.report_type].total++
    if (r.done) breakdown[r.task.report_type].done++
  }

  function fmtHm(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">
            📋 오늘 업무 진행률
          </CardTitle>
          <Link
            to="/tasks"
            className="text-[12px] font-medium text-primary hover:underline"
          >
            설정 →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            오늘 보고 대상 업무가 없습니다.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums">
                {pct}%
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  ({completed}/{total})
                </span>
              </span>
              {pct === 100 ? (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  🎉 모두 완료
                </span>
              ) : null}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              {(['check', 'photo', 'memo'] as const).map((t) => {
                const g = breakdown[t]
                const p = g.total === 0 ? 0 : Math.round((g.done / g.total) * 100)
                const label =
                  t === 'check' ? '체크' : t === 'photo' ? '사진' : '메모'
                const cls =
                  t === 'check'
                    ? 'bg-emerald-500'
                    : t === 'photo'
                      ? 'bg-sky-500'
                      : 'bg-violet-500'
                return (
                  <div key={t}>
                    <p className="text-muted-foreground">
                      {label} {g.done}/{g.total}
                    </p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                      <div
                        className={cn('h-full transition-all', cls)}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
            {/* 오늘 업무 상세 리스트 */}
            <div className="space-y-1 border-t border-border/30 pt-2">
              {taskRows.map((r) => (
                <div
                  key={r.task.id}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span
                    className={cn(
                      'shrink-0 font-mono',
                      r.done
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-muted-foreground',
                    )}
                    aria-hidden
                  >
                    {r.done ? '✓' : '⬜'}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      r.done && 'text-muted-foreground line-through',
                    )}
                  >
                    {r.task.title}
                  </span>
                  {r.done ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {r.reporterName}
                      </span>
                      <span className="ml-1">{fmtHm(r.completedAt)}</span>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MonthPayrollCard() {
  const today = new Date()
  const monthYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const { data: payrollList } = usePayrollList(ymToFirstDay(monthYm))
  const { data: staffList } = useStaffList()

  const totalStaff = staffList?.length ?? 0
  const confirmedRows = (payrollList ?? []).filter((p) => p.confirmed)
  const confirmedCount = confirmedRows.length
  const pendingCount = Math.max(0, totalStaff - confirmedCount)
  const confirmedTotal = confirmedRows.reduce((s, r) => s + (r.total ?? 0), 0)

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="text-base font-semibold tracking-tight">
            💰 이번 달 ({monthYm}) 인건비
          </CardTitle>
          <Link
            to="/payroll"
            className="text-[12px] font-medium text-primary hover:underline"
          >
            정산 →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">
            ₩ {fmtWon(Math.round(confirmedTotal))}
          </p>
          <p className="text-xs text-muted-foreground">확정된 정산 합계</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <KpiTile label="전체" value={totalStaff} accent="muted" />
          <KpiTile label="확정" value={confirmedCount} accent="emerald" />
          <KpiTile label="미정산" value={pendingCount} accent="amber" />
        </div>
      </CardContent>
    </Card>
  )
}

function WeekKpiCard() {
  const today = new Date()
  const weekStart = formatYmdLocal(startOfIsoWeekMonday(today))
  const weekEnd = formatYmdLocal(addDaysLocal(startOfIsoWeekMonday(today), 6))

  const { data: weekRows } = useAttendanceList({ from: weekStart, to: weekEnd })
  const { data: monthCells } = useMonthCellsDateRange(weekStart, weekEnd)
  const { data: shiftStore } = useShiftTimeSettings()

  const plannedMap = plannedFromMonthCells(
    monthCells ?? [],
    shiftStore?.store ?? null,
  )

  // 예정 건수 (일자별 staff_id 합)
  const totalPlanned = plannedMap.size

  // 실 출근 count + 지각 count + 근무 분 합
  let actualIn = 0
  let lateCount = 0
  let totalMin = 0
  let durCount = 0
  for (const r of weekRows ?? []) {
    if (!r.check_in) continue
    actualIn++
    const dateKey = String(r.check_in).slice(0, 10)
    const planned = plannedMap.get(`${r.staff_id}_${dateKey}`)
    if (planned?.startHm) {
      const pm = hmToMinutes(planned.startHm)
      const am = isoToMinutes(r.check_in)
      if (pm != null && am != null && am - pm > 0) lateCount++
    }
    if (r.check_in && r.check_out) {
      const diff =
        (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) /
        60000
      if (diff > 0) {
        totalMin += diff
        durCount++
      }
    }
  }
  const attendRate =
    totalPlanned === 0 ? 0 : Math.round((actualIn / totalPlanned) * 100)
  const avgHours =
    durCount === 0 ? 0 : Math.round((totalMin / durCount / 60) * 10) / 10

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold tracking-tight">
          📊 이번 주 출퇴근 지표
        </CardTitle>
        <CardDescription className="text-[11px]">
          {weekStart} ~ {weekEnd}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          <KpiTile
            label="출근율"
            value={totalPlanned > 0 ? `${attendRate}%` : '—'}
            accent={attendRate >= 90 ? 'emerald' : attendRate >= 70 ? 'amber' : 'muted'}
          />
          <KpiTile
            label="지각"
            value={lateCount > 0 ? `${lateCount}건` : '—'}
            accent={lateCount > 0 ? 'destructive' : 'muted'}
          />
          <KpiTile
            label="평균 근무"
            value={avgHours > 0 ? `${avgHours}h` : '—'}
            accent="muted"
          />
        </div>
      </CardContent>
    </Card>
  )
}

const ACCENT_CLASS: Record<
  'emerald' | 'amber' | 'destructive' | 'slate' | 'muted',
  string
> = {
  emerald:
    'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
  amber:
    'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30',
  destructive: 'bg-destructive/12 text-destructive ring-destructive/30',
  slate:
    'bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25',
  muted: 'bg-muted/40 text-foreground ring-border/30',
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent: 'emerald' | 'amber' | 'destructive' | 'slate' | 'muted'
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2 shadow-sm ring-1',
        ACCENT_CLASS[accent],
      )}
    >
      <p className="text-[10.5px] font-medium opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}
