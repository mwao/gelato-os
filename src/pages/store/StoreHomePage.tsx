import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useStoreTasks, type StoreTaskRow } from '@/hooks/useStoreTasks'
import {
  useStoreTaskReports,
  type StoreTaskReportRow,
} from '@/hooks/useStoreTaskReports'
import { isTaskDueOnDate, ymdLocal } from '@/lib/taskRecurrence'
import { cn } from '@/lib/utils'

export function StoreHomePage() {
  const { data: tasks } = useStoreTasks()
  const todayKey = ymdLocal(new Date())
  const { data: reports } = useStoreTaskReports(todayKey)

  /** 오늘 보고 대상 + 보고 그룹 */
  const { dueTasks, reportsByTask } = useMemo(() => {
    const d = new Date()
    const due = (tasks ?? []).filter((t) => isTaskDueOnDate(t, d))
    const m = new Map<string, StoreTaskReportRow[]>()
    for (const r of reports ?? []) {
      if (!m.has(r.task_id)) m.set(r.task_id, [])
      m.get(r.task_id)!.push(r)
    }
    return { dueTasks: due, reportsByTask: m }
  }, [tasks, reports])

  /** 보고 방식별 진행률 + 전체 카운트 한 번에 집계 */
  const { total, completed, breakdown } = useMemo(() => {
    const isDone = (t: StoreTaskRow): boolean => {
      const rs = reportsByTask.get(t.id) ?? []
      if (rs.length === 0) return false
      switch (t.report_type) {
        case 'check':
          return rs.some((r) => r.checked === true)
        case 'photo':
          return rs.some((r) => r.photo_urls.length > 0)
        case 'memo':
          return rs.some((r) => (r.memo ?? '').trim().length > 0)
      }
    }
    const groups: Record<'check' | 'photo' | 'memo', { total: number; done: number }> = {
      check: { total: 0, done: 0 },
      photo: { total: 0, done: 0 },
      memo: { total: 0, done: 0 },
    }
    let doneCount = 0
    for (const t of dueTasks) {
      groups[t.report_type].total++
      if (isDone(t)) {
        groups[t.report_type].done++
        doneCount++
      }
    }
    return {
      total: dueTasks.length,
      completed: doneCount,
      breakdown: groups,
    }
  }, [dueTasks, reportsByTask])

  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

  return (
    <div className="space-y-5">
      {/* 오늘 업무 진행률 */}
      <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
        <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-lg font-semibold tracking-tight">
              📋 오늘 업무 진행률
            </CardTitle>
            <span className="text-sm tabular-nums text-muted-foreground">
              완료 {completed} / 전체 {total}건
            </span>
          </div>
          <CardDescription className="text-sm leading-relaxed">
            {total === 0
              ? '오늘은 보고할 업무가 없습니다.'
              : pct === 100
                ? '🎉 오늘 업무 전부 완료했습니다!'
                : `진행률 ${pct}%`}
          </CardDescription>
          {total > 0 ? (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </CardHeader>
        {total > 0 ? (
          <CardContent className="grid gap-3 pt-5 sm:grid-cols-3">
            {(['check', 'photo', 'memo'] as const).map((t) => {
              const g = breakdown[t]
              const p = g.total === 0 ? 0 : Math.round((g.done / g.total) * 100)
              const label =
                t === 'check' ? '체크 보고' : t === 'photo' ? '사진 보고' : '메모 보고'
              const cls =
                t === 'check'
                  ? 'bg-emerald-500'
                  : t === 'photo'
                    ? 'bg-sky-500'
                    : 'bg-violet-500'
              return (
                <div
                  key={t}
                  className="rounded-xl bg-muted/15 p-3 shadow-sm ring-1 ring-border/25"
                >
                  <p className="text-[12px] font-medium text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {p}%{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({g.done}/{g.total})
                    </span>
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className={cn('h-full transition-all', cls)}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        ) : null}
      </Card>

      {/* 액션 카드 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ActionCard
          to="/store/tasks"
          icon="📋"
          title="업무 보고"
          subtitle={
            total > 0 ? `${total - completed}건 남음` : '오늘 업무 없음'
          }
        />
        <ActionCard
          to="/store/attendance"
          icon="⏰"
          title="출퇴근 펀치"
          subtitle="출근·퇴근 기록"
        />
        <ActionCard
          to="/store/schedule"
          icon="🗓️"
          title="근무표"
          subtitle="이번 달 근무 일정"
        />
      </div>
    </div>
  )
}

function ActionCard({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string
  icon: string
  title: string
  subtitle: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card p-4 shadow-sm transition-all hover:bg-muted/40 hover:shadow-md active:scale-[0.99]"
    >
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-tight">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <span className="text-muted-foreground" aria-hidden>
        →
      </span>
    </Link>
  )
}
