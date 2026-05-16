import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  useAttendanceList,
  usePunchIn,
  usePunchOut,
} from '@/hooks/useAttendance'
import { useMonthCellsDateRange } from '@/hooks/useMonthSchedule'
import { useShiftTimeSettings } from '@/hooks/useShiftSettings'
import { useStaffList } from '@/hooks/useStaff'
import { groupAttendanceByDateStaff } from '@/lib/attendanceDisplay'
import { plannedFromMonthCells } from '@/lib/plannedFromWeek'
import { ymdLocal } from '@/lib/taskRecurrence'
import { cn } from '@/lib/utils'

function fmtHm(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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

export function StoreAttendancePage() {
  const todayKey = ymdLocal(new Date())
  const { data: staffList, isLoading: sLoading } = useStaffList()
  const { data: todayRows } = useAttendanceList({
    from: todayKey,
    to: todayKey,
  })
  const { data: monthCells } = useMonthCellsDateRange(todayKey, todayKey)
  const { data: shiftStore } = useShiftTimeSettings()

  const punchIn = usePunchIn()
  const punchOut = usePunchOut()

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [err, setErr] = useState<{ staffId: string; message: string } | null>(
    null,
  )
  const [info, setInfo] = useState<string | null>(null)

  const plannedMap = plannedFromMonthCells(
    monthCells ?? [],
    shiftStore?.store ?? null,
  )
  const todayGrouped = groupAttendanceByDateStaff(todayRows ?? [])
  const todayGroup = todayGrouped.find((g) => g.dateKey === todayKey)

  async function handlePunchIn(staffId: string, name: string) {
    setErr(null)
    setInfo(null)
    try {
      await punchIn.mutateAsync(staffId)
      setInfo(`${name} 출근 처리됨`)
      setTimeout(() => setInfo(null), 2500)
    } catch (e) {
      setErr({
        staffId,
        message: e instanceof Error ? e.message : '출근 처리에 실패했습니다.',
      })
    }
  }

  async function handlePunchOut(staffId: string, name: string) {
    setErr(null)
    setInfo(null)
    try {
      await punchOut.mutateAsync(staffId)
      setInfo(`${name} 퇴근 처리됨`)
      setTimeout(() => setInfo(null), 2500)
    } catch (e) {
      setErr({
        staffId,
        message: e instanceof Error ? e.message : '퇴근 처리에 실패했습니다.',
      })
    }
  }

  const busy = punchIn.isPending || punchOut.isPending

  // 매장 전체 카운터
  const summary = (() => {
    let working = 0
    let done = 0
    let pending = 0
    let off = 0
    let late = 0
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
      else pending++
      if (aIn && p.startHm) {
        const pm = hmToMinutes(p.startHm)
        const am = isoToMinutes(aIn)
        if (pm != null && am != null && am - pm > 0) late++
      }
    }
    return { working, done, pending, off, late }
  })()

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">
              출퇴근 펀치
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              본인 카드를 탭하면 활성화되고, 「출근」/「퇴근」 버튼이 나타납니다.
            </CardDescription>
          </div>
          <SummaryBadges counts={summary} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-5">
        {info ? (
          <p className="rounded-md bg-emerald-500/[0.08] px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300">
            ✓ {info}
          </p>
        ) : null}

        {sLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : !staffList || staffList.length === 0 ? (
          <p className="rounded-2xl bg-muted/15 p-6 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/25">
            등록된 직원이 없습니다.
          </p>
        ) : (
          <div className="space-y-2.5">
            {staffList.map((s) => {
              const block = todayGroup?.blocks.find((b) => b.staff_id === s.id)
              const aIn = block?.actual?.check_in ?? null
              const aOut = block?.actual?.check_out ?? null
              const planned = plannedMap.get(`${s.id}_${todayKey}`)

              const hasIn = Boolean(aIn)
              const hasOut = Boolean(aOut)
              const isMe = selectedStaffId === s.id

              let status: { label: string; cls: string } = {
                label: '휴무',
                cls: 'bg-muted text-muted-foreground ring-border/40',
              }
              if (planned) {
                if (hasIn && hasOut)
                  status = {
                    label: '근무종료',
                    cls: 'bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25',
                  }
                else if (hasIn)
                  status = {
                    label: '근무중',
                    cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
                  }
                else
                  status = {
                    label: '미출근',
                    cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30',
                  }
              }

              let lateLabel: string | null = null
              if (aIn && planned?.startHm) {
                const pm = hmToMinutes(planned.startHm)
                const am = isoToMinutes(aIn)
                if (pm != null && am != null && am - pm > 0)
                  lateLabel = `지각 ${am - pm}분`
              }

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStaffId(s.id)}
                  className={cn(
                    'block w-full rounded-2xl border bg-card p-3 text-left shadow-sm transition-all',
                    isMe
                      ? 'border-primary/50 ring-2 ring-primary/30 shadow-md shadow-primary/10'
                      : 'border-border/40 opacity-55 hover:opacity-80',
                  )}
                  aria-pressed={isMe}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ring-1',
                        status.cls,
                      )}
                    >
                      {status.label}
                    </span>
                    <span className="truncate text-base font-semibold tracking-tight">
                      {s.name}
                    </span>
                    {isMe ? (
                      <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        본인
                      </span>
                    ) : null}
                    {planned ? (
                      <span className="ml-auto shrink-0 text-[11px] font-medium text-muted-foreground">
                        {planned.bandLabel} · {planned.startHm}~{planned.endHm}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-baseline gap-2 font-mono text-sm tabular-nums">
                    <span
                      className={
                        hasIn ? 'font-semibold' : 'text-muted-foreground'
                      }
                    >
                      출근 {fmtHm(aIn)}
                    </span>
                    {lateLabel ? (
                      <span className="text-destructive">{lateLabel}</span>
                    ) : null}
                    <span className="text-muted-foreground">·</span>
                    <span
                      className={
                        hasOut ? 'font-semibold' : 'text-muted-foreground'
                      }
                    >
                      퇴근 {fmtHm(aOut)}
                    </span>
                  </div>

                  {/* 본인 row만 펀치 버튼 노출 */}
                  {isMe ? (
                    <div
                      className="mt-3 grid grid-cols-2 gap-2 border-t border-border/30 pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="button"
                        className={cn(
                          'h-12 text-base font-semibold',
                          !hasIn ? 'shadow-md shadow-primary/20' : '',
                        )}
                        variant={!hasIn ? 'default' : 'outline'}
                        disabled={hasIn || busy}
                        onClick={() => void handlePunchIn(s.id, s.name)}
                      >
                        {hasIn ? '출근 완료' : '출근'}
                      </Button>
                      <Button
                        type="button"
                        className={cn(
                          'h-12 text-base font-semibold',
                          hasIn && !hasOut ? 'shadow-md shadow-primary/20' : '',
                        )}
                        variant={hasIn && !hasOut ? 'default' : 'outline'}
                        disabled={!hasIn || hasOut || busy}
                        onClick={() => void handlePunchOut(s.id, s.name)}
                      >
                        {hasOut ? '퇴근 완료' : '퇴근'}
                      </Button>
                    </div>
                  ) : null}

                  {err && err.staffId === s.id ? (
                    <p className="mt-2 text-xs text-destructive">{err.message}</p>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryBadges({
  counts,
}: {
  counts: {
    working: number
    done: number
    pending: number
    off: number
    late: number
  }
}) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ring-1'
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span
        className={cn(
          base,
          'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
        )}
      >
        근무중 <span className="font-semibold tabular-nums">{counts.working}</span>
      </span>
      <span
        className={cn(
          base,
          'bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25',
        )}
      >
        종료 <span className="font-semibold tabular-nums">{counts.done}</span>
      </span>
      <span
        className={cn(
          base,
          'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30',
        )}
      >
        미출근 <span className="font-semibold tabular-nums">{counts.pending}</span>
      </span>
      <span className={cn(base, 'bg-muted text-muted-foreground ring-border/40')}>
        휴무 <span className="font-semibold tabular-nums">{counts.off}</span>
      </span>
      {counts.late > 0 ? (
        <span
          className={cn(
            base,
            'bg-destructive/12 text-destructive ring-destructive/30',
          )}
        >
          지각 <span className="font-semibold tabular-nums">{counts.late}</span>
        </span>
      ) : null}
    </div>
  )
}
