import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router-dom'
import { useQueries, useQueryClient } from '@tanstack/react-query'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAuthErrorMessage } from '@/lib/authErrors'
import { getPostgrestMessage, isUniqueViolation } from '@/lib/postgresErrors'
import {
  addDaysLocal,
  DOW_KO,
  daysInMonth,
  DEFAULT_SHIFT_TIME_SETTINGS,
  formatYmdLocal,
  parseYmdLocal,
  SHIFT_LABEL,
  shiftForSlotIndex,
  startOfIsoWeekMonday,
  type ShiftTimeSettings,
  weekSlotBandBgClass,
  weekStaffChipShellClass,
  WEEK_GRID_DOW_KO,
  WEEK_SLOT_LABELS,
} from '@/lib/dateUtils'
import { groupAttendanceByDateStaff, type StaffDayBlock } from '@/lib/attendanceDisplay'
import {
  mergePlannedByStaffDate,
  type PlannedWorkDetail,
} from '@/lib/plannedFromWeek'
import { cn } from '@/lib/utils'
import {
  useAttendanceList,
  useCorrectAttendance,
  useDeleteAttendance,
  describeBaselineSyncSummary,
  useGenerateAttendanceBaseline,
  usePunchIn,
  usePunchOut,
} from '@/hooks/useAttendance'
import {
  useChecklistCompletionToday,
  useCompleteChecklistItem,
  useCreateChecklistItem,
  useChecklistItems,
  useDeleteChecklistItem,
} from '@/hooks/useChecklist'
import { useEnsureDefaultEmploymentTypes, useEmploymentTypes, sortEmploymentTypesForSelect } from '@/hooks/useEmploymentTypes'
import { useShiftTimeSettings, useUpdateShiftTimeSettings } from '@/hooks/useShiftSettings'
import { useStaffWeekCalendarPlans } from '@/hooks/useStaffWeekPlan'
import { useStore as useStoreQuery } from '@/hooks/useStore'
import type { ShiftCode } from '@/hooks/useStaff'
import {
  useCreateStaff,
  useDeleteStaff,
  useReplaceStaffDefaultShifts,
  useStaffDetail,
  useStaffList,
  useUpdateStaff,
} from '@/hooks/useStaff'
import type { WeekSlot } from '@/hooks/useWeekSchedule'
import { fetchStaffWithDefaultShifts } from '@/hooks/useMonthSchedule'
import {
  fetchWeekSlots,
  mergeWeekDraftWithProfileForStaff,
  stripStaffFromWeekDraft,
  usePersistWeekDraft,
  useWeekSlots,
  weekDraftFromProfileDefaults,
} from '@/hooks/useWeekSchedule'

const SHIFT_OPTIONS: ShiftCode[] = ['open', 'middle', 'close']

/**
 * 인력 관리 라우트 부모. 각 서브경로(`/staff/profile`, `/staff/schedule`,
 * `/staff/attendance`, `/staff/checklist`)에서 자식 페이지가 렌더된다.
 *
 * 부모에서는 매장당 1회 employment_types 시드만 담당.
 */
export function StaffPage() {
  const { data: store } = useStoreQuery()
  const storeId = store?.id
  const ensureTypes = useEnsureDefaultEmploymentTypes()
  const { isLoading: emplLoading } = useEmploymentTypes()

  /** 매장당 1회만 시드 시도. mutation 객체를 deps에 넣지 말 것(렌더마다 바뀌어 무한 호출). */
  const employmentSeedAttemptedForStore = useRef<string | null>(null)
  useEffect(() => {
    if (!storeId) return
    if (employmentSeedAttemptedForStore.current === storeId) return
    employmentSeedAttemptedForStore.current = storeId
    void ensureTypes.mutateAsync().catch(() => {
      employmentSeedAttemptedForStore.current = null
    })
  }, [storeId])

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        인력·근무표·출퇴근·체크리스트는 설계서 Feature 3 스키마와 연결됩니다. 최초 사용 전{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          supabase/sql/feature3_hr_tables.sql
        </code>{' '}
        를 Supabase에서 실행해 주세요.
      </p>
      {emplLoading ? <AuthLoading /> : <Outlet />}
    </div>
  )
}

export function StaffProfilePage() {
  return <StaffProfileSection />
}
export function StaffSchedulePage() {
  return <StaffScheduleSection />
}
export function StaffAttendancePage() {
  return <StaffAttendanceSection />
}
export function StaffChecklistPage() {
  return <StaffChecklistSection />
}

function StaffProfileSection() {
  const { data: staffList, isLoading, isError, error, refetch } = useStaffList()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  function openDetail(id: string) {
    setSelectedId((prev) => (prev === id ? null : id))
    if (selectedId !== id) {
      setTimeout(
        () => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
        80,
      )
    }
  }

  if (isLoading) return <AuthLoading />
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">직원 목록을 불러오지 못했습니다</CardTitle>
          <CardDescription>
            {formatAuthErrorMessage(
              error instanceof Error ? error.message : String(error),
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => refetch()}>
            다시 시도
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          onClick={() => openDetail('new')}
        >
          새 직원
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">직원 목록</CardTitle>
          <CardDescription>이름을 누르면 아래에서 바로 수정할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-2 font-medium">이름</th>
                <th className="pb-2 font-medium">연락처</th>
                <th className="pb-2 font-medium">고용형태</th>
                <th className="pb-2 font-medium text-right">시급</th>
              </tr>
            </thead>
            <tbody>
              {staffList?.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    'border-b border-border/40 transition-colors',
                    selectedId === s.id && 'bg-primary/5',
                  )}
                >
                  <td className="py-2">
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => openDetail(s.id)}
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className="py-2 text-muted-foreground">{s.phone ?? '—'}</td>
                  <td className="py-2">{s.employment_label ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums">
                    {s.hourly_rate.toLocaleString()}원
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!staffList?.length ? (
            <p className="py-6 text-sm text-muted-foreground">등록된 직원이 없습니다.</p>
          ) : null}
        </CardContent>
      </Card>

      {/* 인라인 상세 패널 */}
      {selectedId ? (
        <div ref={detailRef} className="animate-in fade-in slide-in-from-top-2 duration-150">
          <StaffDetailForm
            staffId={selectedId}
            onClose={() => setSelectedId(null)}
            onSaved={() => setSelectedId(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

function StaffDetailForm({
  staffId,
  onClose,
  onSaved,
}: {
  staffId: string
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = staffId === 'new'
  const { data: detail, isLoading } = useStaffDetail(isNew ? undefined : staffId)
  const { data: emplTypes } = useEmploymentTypes()
  const createMut = useCreateStaff()
  const updateMut = useUpdateStaff()
  const replaceShifts = useReplaceStaffDefaultShifts()
  const deleteMut = useDeleteStaff()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [hourly, setHourly] = useState('9860')
  const [emplId, setEmplId] = useState<string>('')
  const [hire, setHire] = useState('')
  const [healthExp, setHealthExp] = useState('')
  const [rules, setRules] = useState<{ dow: number; shift: ShiftCode }[]>([])
  const [calYm, setCalYm] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [formErr, setFormErr] = useState<string | null>(null)

  const sortedEmplTypes = useMemo(
    () => sortEmploymentTypesForSelect(emplTypes ?? []),
    [emplTypes],
  )

  useEffect(() => {
    if (!isNew || emplId) return
    const mgr = sortedEmplTypes.find((t) => t.code === 'manager')
    if (mgr) setEmplId(mgr.id)
  }, [isNew, emplId, sortedEmplTypes])

  const { byDay, isLoading: calPlanLoading } = useStaffWeekCalendarPlans(
    isNew ? undefined : staffId,
    calYm,
  )
  const [calHover, setCalHover] = useState<{
    clientX: number
    clientY: number
    label: string
  } | null>(null)
  const [calModalDay, setCalModalDay] = useState<number | null>(null)

  useEffect(() => {
    if (!detail) return
    setName(detail.name)
    setPhone(detail.phone ?? '')
    setHourly(String(detail.hourly_rate))
    setEmplId(detail.employment_type_id ?? '')
    setHire(detail.hire_date ?? '')
    setHealthExp(detail.health_cert_expires ?? '')
    setRules(
      detail.default_shifts.map((r) => ({
        dow: r.day_of_week,
        shift: r.shift,
      })),
    )
  }, [detail])

  const [y, mm] = calYm.split('-').map(Number)
  const dim = daysInMonth(y, mm)
  const firstWd = new Date(y, mm - 1, 1).getDay()
  const blanks = Array.from({ length: firstWd }, (_, i) => (
    <div key={`b-${i}`} />
  ))
  const cells = Array.from({ length: dim }, (_, i) => {
    const day = i + 1
    const plan = byDay.get(day)
    const workDate = `${calYm}-${String(day).padStart(2, '0')}`
    return (
      <div key={day} className="relative">
        <button
          type="button"
          className={cn(
            'flex min-h-[40px] w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-border/50 px-0.5 text-[11px] transition-colors',
            plan
              ? 'bg-primary/12 text-foreground'
              : 'bg-muted/30 text-muted-foreground',
            !plan && 'cursor-default',
          )}
          disabled={!plan}
          onMouseEnter={(e) => {
            if (!plan) return
            setCalHover({
              clientX: e.clientX,
              clientY: e.clientY,
              label: `${workDate}\n${plan.rangeLabel} (${plan.bandLabel})`,
            })
          }}
          onMouseMove={(e) =>
            setCalHover((prev) =>
              prev && plan
                ? { ...prev, clientX: e.clientX, clientY: e.clientY }
                : prev,
            )
          }
          onMouseLeave={() => setCalHover(null)}
          onClick={() => {
            if (plan) setCalModalDay(day)
          }}
        >
          <span className="font-medium">{day}</span>
          <span>{plan ? '근무' : '—'}</span>
        </button>
      </div>
    )
  })

  const calModalPlan = calModalDay != null ? byDay.get(calModalDay) : undefined

  async function handleSave() {
    setFormErr(null)
    const hr = parseFloat(hourly.replace(/,/g, ''))
    if (!name.trim()) {
      setFormErr('이름을 입력해 주세요.')
      return
    }
    if (!phone.trim()) {
      setFormErr('연락처를 입력해 주세요.')
      return
    }
    if (!emplId) {
      setFormErr('고용형태를 선택해 주세요.')
      return
    }
    if (Number.isNaN(hr) || hr < 0) {
      setFormErr('시급을 확인해 주세요.')
      return
    }
    const seenDowShift = new Set<string>()
    for (const r of rules) {
      const key = `${r.dow}:${r.shift}`
      if (seenDowShift.has(key)) {
        const msg = `같은 요일·같은 시프트「${DOW_KO[r.dow]} · ${SHIFT_LABEL[r.shift]}」이 두 번 이상 지정되어 있습니다. 요일은 같아도 시프트가 다르면 여러 줄을 둘 수 있습니다.`
        window.alert(msg)
        setFormErr(msg)
        return
      }
      seenDowShift.add(key)
    }
    try {
      if (isNew) {
        const row = await createMut.mutateAsync({
          name: name.trim(),
          phone: phone.trim(),
          hourly_rate: hr,
          employment_type_id: emplId,
          hire_date: hire || null,
          health_cert_expires: healthExp || null,
        })
        await replaceShifts.mutateAsync({
          staffId: row.id,
          shifts: rules.map((r) => ({
            day_of_week: r.dow,
            shift: r.shift,
          })),
        })
        onSaved()
      } else {
        await updateMut.mutateAsync({
          id: staffId,
          name: name.trim(),
          phone: phone.trim(),
          hourly_rate: hr,
          employment_type_id: emplId,
          hire_date: hire || null,
          health_cert_expires: healthExp || null,
        })
        await replaceShifts.mutateAsync({
          staffId,
          shifts: rules.map((r) => ({
            day_of_week: r.dow,
            shift: r.shift,
          })),
        })
        onSaved()
      }
    } catch (e) {
      if (isUniqueViolation(e)) {
        const msg =
          '같은 요일·같은 시프트 조합이 중복되어 저장할 수 없습니다. (데이터베이스 제약) 동일 조합을 한 번만 두거나, 시프트를 바꿔 주세요.'
        window.alert(msg)
        setFormErr(msg)
        return
      }
      setFormErr(formatAuthErrorMessage(getPostgrestMessage(e)))
    }
  }

  async function handleDelete() {
    if (isNew) return
    if (!window.confirm('이 직원을 삭제할까요? 관련 배정·출퇴근 기록에 영향이 있을 수 있습니다.'))
      return
    setFormErr(null)
    try {
      await deleteMut.mutateAsync(staffId)
      onSaved()
    } catch (e) {
      setFormErr(formatAuthErrorMessage(getPostgrestMessage(e)))
    }
  }

  if (!isNew && isLoading) return <AuthLoading />

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            ✕ 닫기
          </Button>
          <CardTitle className="text-base">{isNew ? '새 직원' : '직원 상세'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="st-name">
              이름 <span className="text-destructive" aria-hidden> *</span>
            </Label>
            <Input
              id="st-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              aria-required="true"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-phone">
              연락처 <span className="text-destructive" aria-hidden> *</span>
            </Label>
            <Input
              id="st-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
              aria-required="true"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-empl">
              고용형태 <span className="text-destructive" aria-hidden> *</span>
            </Label>
            <select
              id="st-empl"
              className="border-input bg-background h-9 w-full rounded-lg border px-2 text-sm"
              value={emplId}
              onChange={(e) => setEmplId(e.target.value)}
              aria-required="true"
            >
              <option value="">선택…</option>
              {sortedEmplTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-hourly">시급 (원)</Label>
            <Input
              id="st-hourly"
              inputMode="decimal"
              value={hourly}
              onChange={(e) => setHourly(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-hire">입사일</Label>
            <Input
              id="st-hire"
              type="date"
              value={hire}
              onChange={(e) => setHire(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="st-health">보건증 만료</Label>
            <Input
              id="st-health"
              type="date"
              value={healthExp}
              onChange={(e) => setHealthExp(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p className="mb-3 text-sm font-medium">근무요일·시프트 (프로필 기본)</p>
          <p className="mb-3 text-xs text-muted-foreground">
            같은 요일에 시프트가 다른 줄은 여러 개 둘 수 있습니다. 동일 요일·동일 시프트만 중복할 수
            없습니다. «근무표 가져오기» 시 이 요일·시프트를 주간 그리드에 풀어 넣습니다.
          </p>
          <div className="space-y-2">
            {rules.map((r, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select
                  className="border-input h-9 rounded-lg border px-2 text-sm"
                  value={r.dow}
                  onChange={(e) => {
                    const next = [...rules]
                    next[idx] = { ...r, dow: Number(e.target.value) }
                    setRules(next)
                  }}
                >
                  {DOW_KO.map((label, dow) => (
                    <option key={dow} value={dow}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  className="border-input h-9 rounded-lg border px-2 text-sm"
                  value={r.shift}
                  onChange={(e) => {
                    const next = [...rules]
                    next[idx] = {
                      ...r,
                      shift: e.target.value as ShiftCode,
                    }
                    setRules(next)
                  }}
                >
                  {SHIFT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SHIFT_LABEL[s]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setRules(rules.filter((_, i) => i !== idx))}
                >
                  삭제
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() =>
              setRules([...rules, { dow: 1, shift: 'middle' }])
            }
          >
            요일 행 추가
          </Button>
        </div>

        {!isNew ? (
          <div className="rounded-xl border border-border/50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">근무 달력</p>
              <Input
                className="max-w-[160px]"
                type="month"
                value={calYm}
                onChange={(e) => setCalYm(e.target.value)}
              />
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              <strong>읽기 전용</strong> — «근무표» 탭 주간 저장 배정이 반영됩니다. 셀에는
              &apos;근무&apos;만 표시하고, 마우스를 올리거나 누르면 예정 시간(슬롯)을
              봅니다. 편집은 근무표에서 하세요.
            </p>
            {calPlanLoading ? (
              <p className="text-muted-foreground mb-2 text-xs">달력 연동 불러오는 중…</p>
            ) : null}
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
              {DOW_KO.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {blanks}
              {cells}
            </div>
            {calHover
              ? createPortal(
                  <div
                    className="border-border bg-popover text-popover-foreground pointer-events-none fixed z-[10000] max-w-[280px] whitespace-pre-line rounded-md border px-2 py-1.5 text-xs shadow-lg"
                    style={{
                      left: calHover.clientX + 12,
                      top: calHover.clientY + 12,
                    }}
                  >
                    {calHover.label}
                  </div>,
                  document.body,
                )
              : null}
            {calModalDay !== null && calModalPlan ? (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setCalModalDay(null)
                }}
              >
                <div className="bg-card w-full max-w-sm rounded-xl border p-4 shadow-lg">
                  <p className="text-muted-foreground mb-2 text-xs">
                    {`${calYm}-${String(calModalDay).padStart(2, '0')}`}
                  </p>
                  <p className="mb-1 text-sm font-medium">예정 근무</p>
                  <p className="text-sm">{calModalPlan.rangeLabel}</p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    구간: {calModalPlan.bandLabel}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => setCalModalDay(null)}
                  >
                    닫기
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            저장 후 «근무표»에서 배정하면 이 달력에 연동됩니다.
          </p>
        )}

        {formErr ? (
          <p className="text-sm text-destructive" role="alert">
            {formErr}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={createMut.isPending || updateMut.isPending}
          >
            저장
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          {!isNew ? (
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => void handleDelete()}
            >
              삭제
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function buildWeekDraftFromSlots(
  slots: WeekSlot[] | undefined,
): Record<string, string[]> {
  const d: Record<string, string[]> = {}
  if (!slots) return d
  for (const s of slots) {
    d[`${s.slot_index}_${s.day_index}`] = s.assignees.map((a) => a.staff_id)
  }
  return d
}

function StaffScheduleSection() {
  const [sub, setSub] = useState<'week' | 'settings'>('week')
  const [weekStart, setWeekStart] = useState(() =>
    formatYmdLocal(startOfIsoWeekMonday(new Date())),
  )
  const weekEnd = useMemo(
    () => formatYmdLocal(addDaysLocal(parseYmdLocal(weekStart), 6)),
    [weekStart],
  )

  /** 열 순서 = 월(0) … 일(6), `week_start`(월요일) 기준 실제 날짜 */
  const weekGridColumnMeta = useMemo(() => {
    const base = parseYmdLocal(weekStart)
    return [0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
      const d = addDaysLocal(base, dayIdx)
      return {
        dayIdx,
        dowLabel: WEEK_GRID_DOW_KO[dayIdx]!,
        md: `${d.getMonth() + 1}/${d.getDate()}`,
      }
    })
  }, [weekStart])

  const { data: store } = useStoreQuery()
  const storeId = store?.id
  const [pickStaff, setPickStaff] = useState<string>('')
  const { data: staffList } = useStaffList()
  const { data: shiftStoreSettings, refetch: refetchShiftSettings } =
    useShiftTimeSettings()
  const shiftSettings = shiftStoreSettings?.settings

  const persistWeek = usePersistWeekDraft()
  const { data: slots } = useWeekSlots(weekStart)
  const genBase = useGenerateAttendanceBaseline()

  const weekDragRef = useRef<{ day: number } | null>(null)
  const [weekDraft, setWeekDraft] = useState<Record<string, string[]>>({})
  const [applyProfileBusy, setApplyProfileBusy] = useState(false)

  useEffect(() => {
    setWeekDraft(buildWeekDraftFromSlots(slots))
  }, [weekStart, slots])

  useEffect(() => {
    const endDrag = () => {
      weekDragRef.current = null
    }
    window.addEventListener('mouseup', endDrag)
    window.addEventListener('touchend', endDrag)
    return () => {
      window.removeEventListener('mouseup', endDrag)
      window.removeEventListener('touchend', endDrag)
    }
  }, [])

  const effectiveShiftSettings =
    shiftSettings ?? DEFAULT_SHIFT_TIME_SETTINGS

  const updateShiftSettings = useUpdateShiftTimeSettings()
  const [editShift, setEditShift] = useState<ShiftTimeSettings | null>(null)
  useEffect(() => {
    if (shiftSettings) setEditShift(shiftSettings)
  }, [shiftSettings])

  function navWeek(delta: number) {
    const base = parseYmdLocal(weekStart)
    base.setDate(base.getDate() + delta * 7)
    setWeekStart(formatYmdLocal(startOfIsoWeekMonday(base)))
  }

  function slotPast(dayIdx: number, slotIdx: number) {
    const base = parseYmdLocal(weekStart)
    const d = addDaysLocal(base, dayIdx)
    d.setHours(9 + slotIdx, 0, 0, 0)
    return d.getTime() < Date.now()
  }

  function weekDraftKey(slotIdx: number, dayIdx: number) {
    return `${slotIdx}_${dayIdx}`
  }

  function addStaffToWeekCell(dayIdx: number, slotIdx: number) {
    if (!pickStaff || slotPast(dayIdx, slotIdx)) return
    const k = weekDraftKey(slotIdx, dayIdx)
    setWeekDraft((prev) => {
      const next = { ...prev }
      const arr = [...(next[k] ?? [])]
      if (!arr.includes(pickStaff)) arr.push(pickStaff)
      next[k] = arr
      return next
    })
  }

  function removeStaffFromWeekCell(
    dayIdx: number,
    slotIdx: number,
    staffId: string,
  ) {
    if (slotPast(dayIdx, slotIdx)) return
    const k = weekDraftKey(slotIdx, dayIdx)
    setWeekDraft((prev) => {
      const next = { ...prev }
      const arr = (next[k] ?? []).filter((id) => id !== staffId)
      if (arr.length === 0) delete next[k]
      else next[k] = arr
      return next
    })
  }

  function onWeekCellMouseDown(dayIdx: number, slotIdx: number) {
    if (!pickStaff) {
      alert('배정하려면 드롭다운에서 근무자 한 명을 선택해 주세요. «전체»일 때는 표만 모두 보입니다.')
      return
    }
    if (slotPast(dayIdx, slotIdx)) return
    weekDragRef.current = { day: dayIdx }
    addStaffToWeekCell(dayIdx, slotIdx)
  }

  function onWeekCellMouseEnter(dayIdx: number, slotIdx: number) {
    const drag = weekDragRef.current
    if (!drag || drag.day !== dayIdx) return
    if (!pickStaff || slotPast(dayIdx, slotIdx)) return
    addStaffToWeekCell(dayIdx, slotIdx)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-border/50 pb-2">
        <button
          type="button"
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs',
            sub === 'week' ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
          )}
          onClick={() => setSub('week')}
        >
          주간 (시간대)
        </button>
        <button
          type="button"
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs',
            sub === 'settings'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground',
          )}
          onClick={() => setSub('settings')}
        >
          근무관리
        </button>
      </div>

      {sub === 'settings' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">근무관리 — 시프트 시간대</CardTitle>
            <CardDescription>
              오픈·미들·마감의 기본 시작·종료 시각입니다. «근무표 가져오기» 시 직원 프로필
              근무요일·시프트를 이 구간에 맞춰 슬롯에 채웁니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {editShift ? (
              <>
                {(['open', 'middle', 'close'] as const).map((code) => (
                  <div
                    key={code}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-border/50 p-3"
                  >
                    <span className="min-w-[72px] text-sm font-medium">
                      {SHIFT_LABEL[code]}
                    </span>
                    <div className="grid gap-1">
                      <Label className="text-xs">시작</Label>
                      <Input
                        type="time"
                        value={editShift[code].start}
                        onChange={(e) =>
                          setEditShift((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  [code]: {
                                    ...prev[code],
                                    start: e.target.value,
                                  },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">종료</Label>
                      <Input
                        type="time"
                        value={editShift[code].end}
                        onChange={(e) =>
                          setEditShift((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  [code]: { ...prev[code], end: e.target.value },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  disabled={updateShiftSettings.isPending}
                  onClick={() =>
                    editShift &&
                    void updateShiftSettings
                      .mutateAsync(editShift)
                      .then(() => {
                        void refetchShiftSettings()
                        window.alert('근무 시간 설정이 저장되었습니다.')
                      })
                      .catch((e) =>
                        window.alert(
                          `저장에 실패했습니다. ${getPostgrestMessage(e)}`,
                        ),
                      )
                  }
                >
                  저장
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">불러오는 중…</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {sub === 'week' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">주간 근무표</CardTitle>
            <CardDescription>
              드롭다운에서 근무자를 고르면 그 사람만 그리드에 표시되며, 동시에 그 사람을
              셀에 배치하는 대상이 됩니다. «전체»이면 모든 배정이 보이고, 특정 인원을 고른 뒤
              셀을 누르거나 같은 요일(열) 안에서 드래그하면 연속 슬롯에 배정합니다. 칸을 바꾼 뒤
              반드시 «저장»을 눌러야 서버에 반영되며, 그때 출퇴근 «예정»·기준 데이터와
              연동됩니다. 시간대 행·이름 칩 색은 «근무관리» 오픈·미들·마감 구간과 같습니다.
              «근무표 가져오기»는 근무자 선택이 «전체»이면 그리드를 비운 뒤 **모든 직원**
              프로필 근무요일·시프트로 채우고, **특정 직원**을 고른 상태에서는 그 사람의
              배정만 지운 뒤 그 직원 프로필만 반영합니다(다른 직원 칩은 유지). 모두 그리드
              <strong> 초안에만</strong> 적용됩니다(저장 전까지 DB에 올라가지 않음).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => navWeek(-1)}>
                ◀ 이전 주
              </Button>
              <span className="text-sm font-medium tabular-nums">
                {weekStart} ~ {weekEnd}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => navWeek(1)}>
                다음 주 ▶
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-muted-foreground shrink-0 text-sm">
                  근무자 선택
                </span>
                <span className="text-muted-foreground shrink-0 text-sm">:</span>
                <select
                  className="border-input h-9 max-w-[min(100%,280px)] min-w-[140px] rounded-lg border bg-background px-2 text-sm"
                  value={pickStaff}
                  onChange={(e) => setPickStaff(e.target.value)}
                >
                  <option value="">전체</option>
                  {staffList?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={
                    applyProfileBusy ||
                    genBase.isPending ||
                    persistWeek.isPending ||
                    !shiftSettings ||
                    !storeId
                  }
                  onClick={() => {
                    if (!shiftSettings || !storeId) return
                    const isAll = pickStaff === ''
                    const pickedName =
                      staffList?.find((s) => s.id === pickStaff)?.name ||
                      '선택한 직원'
                    if (
                      !window.confirm(
                        isAll
                          ? '전체 근무표 초안을 비운 뒤, 모든 직원 프로필의 근무 요일·시프트로 채웁니다. 계속할까요?'
                          : `「${pickedName}」직원의 배정만 초안에서 지운 뒤, 해당 직원 프로필 근무로 다시 채웁니다. 다른 직원의 배정은 유지됩니다. 계속할까요?`,
                      )
                    )
                      return
                    setApplyProfileBusy(true)
                    void (async () => {
                      try {
                        const staffRows =
                          await fetchStaffWithDefaultShifts(storeId)
                        if (isAll) {
                          const draft = weekDraftFromProfileDefaults(
                            staffRows,
                            shiftSettings,
                          )
                          setWeekDraft(draft)
                          let placed = 0
                          for (const ids of Object.values(draft))
                            placed += ids.length
                          const withRules = staffRows.filter(
                            (s) => s.shifts.length > 0,
                          ).length
                          window.alert(
                            `그리드 초안에 반영했습니다(저장 전까지 서버에 반영되지 않습니다).\n전체 초기화 후 슬롯 배정 ${placed}건 · 근무 규칙이 있는 직원 ${withRules}명`,
                          )
                        } else {
                          const one = staffRows.filter((s) => s.id === pickStaff)
                          const partial = weekDraftFromProfileDefaults(
                            one,
                            shiftSettings,
                          )
                          let placedPartial = 0
                          for (const ids of Object.values(partial))
                            placedPartial += ids.length

                          if (one.length === 0) {
                            setWeekDraft((prev) =>
                              stripStaffFromWeekDraft(prev, pickStaff),
                            )
                            window.alert(
                              `「${pickedName}」님의 프로필에 근무 요일·시프트가 없습니다. 해당 직원의 배정만 그리드에서 제거했습니다(저장 전까지 서버에 반영되지 않습니다).`,
                            )
                          } else {
                            setWeekDraft((prev) =>
                              mergeWeekDraftWithProfileForStaff(
                                prev,
                                one[0]!,
                                shiftSettings,
                              ),
                            )
                            window.alert(
                              `그리드 초안에 반영했습니다(저장 전까지 서버에 반영되지 않습니다).\n「${pickedName}」프로필 기준 슬롯 배정 ${placedPartial}건 · 다른 직원 배정은 유지되었습니다.`,
                            )
                          }
                        }
                      } catch (e) {
                        window.alert(
                          `처리에 실패했습니다. ${getPostgrestMessage(e)}`,
                        )
                      } finally {
                        setApplyProfileBusy(false)
                      }
                    })()
                  }}
                >
                  근무표 가져오기
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={persistWeek.isPending || genBase.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        '근무표를 저장하시겠습니까?\n\n저장한 내용은 출퇴근 기록의 예정 시간·기준 데이터와 연동됩니다.',
                      )
                    )
                      return
                    void persistWeek
                      .mutateAsync({ weekStart, draft: weekDraft })
                      .then(async () => {
                        try {
                          const summary = await genBase.mutateAsync(weekStart)
                          window.alert(
                            `주간 근무표가 저장되었습니다.\n\n${describeBaselineSyncSummary(summary)}`,
                          )
                        } catch (e) {
                          window.alert(
                            `근무표는 저장되었으나 출퇴근 기준 생성에 실패했습니다. ${getPostgrestMessage(e)}`,
                          )
                        }
                      })
                      .catch((e) =>
                        window.alert(
                          `저장에 실패했습니다. ${getPostgrestMessage(e)}`,
                        ),
                      )
                  }}
                >
                  저장
                </Button>
              </div>
            </div>
            {persistWeek.isPending || genBase.isPending
              ? createPortal(
                  <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                  >
                    <div className="border-border/60 bg-card text-card-foreground flex w-full max-w-[min(100%,340px)] flex-col items-center gap-5 rounded-2xl border px-8 py-9 shadow-lg">
                      <div className="relative size-[76px] shrink-0" aria-hidden>
                        <svg
                          className="text-muted/35 size-full -rotate-90"
                          viewBox="0 0 48 48"
                          fill="none"
                        >
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="5"
                          />
                        </svg>
                        <svg
                          className="text-primary absolute inset-0 size-full -rotate-90 motion-safe:animate-spin motion-reduce:animate-none"
                          viewBox="0 0 48 48"
                          fill="none"
                        >
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="5"
                            strokeLinecap="round"
                            strokeDasharray="32 100"
                          />
                        </svg>
                      </div>
                      <p className="text-center text-sm leading-relaxed text-muted-foreground">
                        {persistWeek.isPending
                          ? '근무표를 저장하는 중…'
                          : '출퇴근 기준 데이터를 반영하는 중…'}
                      </p>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[720px] table-fixed border-collapse text-xs"
                onMouseLeave={() => {
                  weekDragRef.current = null
                }}
              >
                <colgroup>
                  <col style={{ width: '72px' }} />
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <col key={i} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="border border-border/50 bg-muted/40 px-1 py-1 text-left">
                      시간
                    </th>
                    {weekGridColumnMeta.map(({ dayIdx, dowLabel, md }) => (
                      <th
                        key={dayIdx}
                        className="border border-border/50 bg-muted/40 px-1 py-1.5"
                      >
                        <div className="flex flex-col items-center gap-0.5 leading-tight">
                          <span className="text-[12px] font-semibold">{dowLabel}</span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {md}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEK_SLOT_LABELS.map((label, slotIdx) => {
                    const slotBand = shiftForSlotIndex(
                      slotIdx,
                      effectiveShiftSettings,
                    )
                    return (
                    <tr key={label}>
                      <td
                        className={cn(
                          'border border-border/50 px-1.5 py-1.5 text-[11px] font-medium',
                          weekSlotBandBgClass(slotBand),
                        )}
                      >
                        {label}
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                        const past = slotPast(dayIdx, slotIdx)
                        const k = weekDraftKey(slotIdx, dayIdx)
                        const rawIds = weekDraft[k] ?? []
                        const ids = pickStaff
                          ? rawIds.filter((id) => id === pickStaff)
                          : rawIds
                        return (
                          <td
                            key={dayIdx}
                            className={cn(
                              'border border-border/50 p-1 align-top select-none',
                              !past && 'bg-card',
                              past && 'bg-muted/50 opacity-60',
                            )}
                            onMouseDown={() =>
                              !past ? onWeekCellMouseDown(dayIdx, slotIdx) : undefined
                            }
                            onMouseEnter={() => onWeekCellMouseEnter(dayIdx, slotIdx)}
                          >
                            <div
                              className={cn(
                                'flex min-h-[38px] w-full min-w-0 flex-col gap-0.5',
                                ids.length === 1 && 'justify-center',
                              )}
                            >
                              {ids.map((sid) => {
                                const name =
                                  staffList?.find((x) => x.id === sid)?.name ?? sid
                                return (
                                  <div
                                    key={sid}
                                    className={weekStaffChipShellClass(slotBand)}
                                  >
                                    <span className="min-w-0 flex-1 truncate font-medium">
                                      {name}
                                    </span>
                                    {!past ? (
                                      <button
                                        type="button"
                                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/15 active:bg-destructive/25"
                                        title="이 슬롯에서 제거"
                                        onMouseDown={(e) => {
                                          e.stopPropagation()
                                        }}
                                        onPointerDown={(e) => {
                                          e.stopPropagation()
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          removeStaffFromWeekCell(
                                            dayIdx,
                                            slotIdx,
                                            sid,
                                          )
                                        }}
                                      >
                                        <span
                                          className="text-base font-light leading-none"
                                          aria-hidden
                                        >
                                          ×
                                        </span>
                                      </button>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

/** 행 내 시각 표시용 — HH:mm (24시간제, 로컬). */
function fmtHm(ts: string | null) {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch {
    return ts
  }
}

function hmToIso(dateKey: string, hm: string): string {
  const [hh, mm] = hm.split(':').map(Number)
  const d = new Date(dateKey)
  d.setHours(hh ?? 0, mm ?? 0, 0, 0)
  return d.toISOString()
}


// ============================================================================
// 출퇴근 표(PersonRow) — 카드 형식(PersonBlock)을 대체하는 9열 표 형식 행
// ----------------------------------------------------------------------------
// 컬럼: 근무자 / 근태 / 출근예정 / 출근 / 출근상태 / 퇴근예정 / 퇴근 / 퇴근상태 /
//       근무시간 / (액션 — 출근·퇴근·수정 버튼)
// ============================================================================

type AttendanceLabel =
  | '출근예정'
  | '근무종료'
  | '휴무'
  | '연차'
  | '조기출근'
  | '정상'
  | '지각'
  | '조퇴'
  | '연장근무'
  | '-'

function hmToMin(hm: string | null | undefined): number | null {
  if (!hm) return null
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10))
  if (Number.isNaN(h)) return null
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

function isoLocalMin(iso: string | null | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

/** 출근 상태: 실제-예정. ≤ -20분 조기출근, -19~0분 정상, ≥ +1분 지각 */
function checkInStatus(
  plannedStartHm: string | undefined,
  actualCheckInIso: string | null | undefined,
): AttendanceLabel {
  const p = hmToMin(plannedStartHm)
  const a = isoLocalMin(actualCheckInIso)
  if (p == null || a == null) return '-'
  const diff = a - p
  if (diff <= -20) return '조기출근'
  if (diff <= 0) return '정상'
  return '지각'
}

/** 퇴근 상태: 실제-예정. ≤ -1분 조퇴, 0~+19분 정상, ≥ +20분 연장근무 */
function checkOutStatus(
  plannedEndHm: string | undefined,
  actualCheckOutIso: string | null | undefined,
): AttendanceLabel {
  const p = hmToMin(plannedEndHm)
  const a = isoLocalMin(actualCheckOutIso)
  if (p == null || a == null) return '-'
  const diff = a - p
  if (diff <= -1) return '조퇴'
  if (diff < 20) return '정상'
  return '연장근무'
}

/** 근무시간: 실제 출근~퇴근 (h:mm). 둘 다 있을 때만. */
function workDurationLabel(
  actualIn: string | null | undefined,
  actualOut: string | null | undefined,
): string {
  if (!actualIn || !actualOut) return '-'
  const ms = new Date(actualOut).getTime() - new Date(actualIn).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** 행 전체 배경 틴트 — 상태를 한눈에 파악하기 위해 */
function rowTintClass(inStatus: AttendanceLabel, outStatus: AttendanceLabel): string {
  if (inStatus === '지각' || outStatus === '조퇴') return 'bg-destructive/[0.04]'
  if (outStatus === '연장근무') return 'bg-amber-500/[0.05]'
  if (inStatus === '조기출근') return 'bg-sky-500/[0.04]'
  if (inStatus === '정상' && outStatus === '정상') return 'bg-emerald-500/[0.03]'
  return ''
}

function attendanceLabelClass(label: AttendanceLabel): string {
  const base =
    'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none'
  switch (label) {
    case '출근예정':
      return `${base} bg-primary/15 text-primary`
    case '근무종료':
      return `${base} bg-slate-500/15 text-slate-700 dark:text-slate-300`
    case '휴무':
      return `${base} bg-muted text-muted-foreground`
    case '연차':
      return `${base} bg-rose-500/15 text-rose-700 dark:text-rose-300`
    case '조기출근':
      return `${base} bg-sky-500/15 text-sky-700 dark:text-sky-300`
    case '정상':
      return `${base} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`
    case '지각':
      return `${base} bg-destructive/15 text-destructive`
    case '조퇴':
      return `${base} bg-destructive/15 text-destructive`
    case '연장근무':
      return `${base} bg-amber-500/15 text-amber-700 dark:text-amber-300`
    default:
      return ''
  }
}

function PersonRow({
  dateKey,
  staffId,
  staffName,
  showPunch,
  block,
  planned,
}: {
  dateKey: string
  staffId: string
  staffName: string
  showPunch: boolean
  block: StaffDayBlock | undefined
  planned: PlannedWorkDetail | undefined
}) {
  const queryClient = useQueryClient()
  const punchIn = usePunchIn()
  const punchOut = usePunchOut()
  const correctAttendance = useCorrectAttendance()
  const deleteAttendance = useDeleteAttendance()
  const [punchError, setPunchError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editIn, setEditIn] = useState('')
  const [editOut, setEditOut] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  const actualRecord = block?.actual ?? null

  const plannedStartHm = planned?.startHm
  const plannedEndHm = planned?.endHm

  const actualInIso = actualRecord?.check_in ?? null
  const actualOutIso = actualRecord?.check_out ?? null
  const actualInHm = actualInIso ? fmtHm(actualInIso) : null
  const actualOutHm = actualOutIso ? fmtHm(actualOutIso) : null

  // 근태 예정: 예정 슬롯이 있으면 「출근예정」, 없으면 「휴무」.
  // 출근·퇴근이 모두 찍히면 「근무종료」로 전환.
  // (※ 「연차」 는 별도 데이터 모델 필요 — 현재 미지원, 추후 휴가 테이블 도입 시 분기 추가 예정.)
  const plannedStatus: AttendanceLabel = !planned
    ? '휴무'
    : actualInIso && actualOutIso
      ? '근무종료'
      : '출근예정'

  const inStatus: AttendanceLabel =
    plannedStatus === '휴무' || !actualInIso
      ? '-'
      : checkInStatus(plannedStartHm, actualInIso)
  const outStatus: AttendanceLabel =
    plannedStatus === '휴무' || !actualOutIso
      ? '-'
      : checkOutStatus(plannedEndHm, actualOutIso)
  const duration = workDurationLabel(actualInIso, actualOutIso)

  const hasActualPunchIn = Boolean(actualInIso)
  const hasActualPunchOut = Boolean(actualOutIso)
  const editableId = actualRecord?.id ?? null

  function openEdit() {
    setEditIn(actualInHm ?? '')
    setEditOut(actualOutHm ?? '')
    setEditError(null)
    setEditMode(true)
  }
  function cancelEdit() {
    setEditMode(false)
    setEditError(null)
  }

  async function handlePunchIn() {
    setPunchError(null)
    try {
      await punchIn.mutateAsync(staffId)
    } catch (e) {
      setPunchError(e instanceof Error ? e.message : '출근 처리에 실패했습니다.')
    } finally {
      await queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    }
  }
  async function handlePunchOut() {
    setPunchError(null)
    try {
      await punchOut.mutateAsync(staffId)
    } catch (e) {
      setPunchError(e instanceof Error ? e.message : '퇴근 처리에 실패했습니다.')
    } finally {
      await queryClient.invalidateQueries({
        queryKey: ['attendance'],
        refetchType: 'active',
      })
    }
  }
  async function handleSaveEdit() {
    setEditError(null)
    if (!editableId) {
      setEditError('수정할 출퇴근 기록이 없습니다.')
      return
    }
    if (!editIn) {
      setEditError('출근 시간을 입력해 주세요.')
      return
    }
    try {
      await correctAttendance.mutateAsync({
        attendanceId: editableId,
        checkIn: hmToIso(dateKey, editIn),
        checkOut: editOut ? hmToIso(dateKey, editOut) : null,
      })
      setEditMode(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '수정에 실패했습니다.')
    }
  }

  async function handleDeleteRecord() {
    if (!editableId) return
    if (!window.confirm(`${staffName}의 출퇴근 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))
      return
    setEditError(null)
    try {
      await deleteAttendance.mutateAsync(editableId)
      setEditMode(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  const cell = 'px-3 py-2.5 align-middle'
  const mono = 'font-mono tabular-nums text-[12px]'
  const muted = 'text-muted-foreground'

  return (
    <>
      <tr className={cn('border-border/40 border-b transition-colors', rowTintClass(inStatus, outStatus))}>
        {/* 근무자 */}
        <td className={`${cell} text-sm font-medium`}>{staffName}</td>

        {/* 근태 */}
        <td className={cell}>
          <span className={attendanceLabelClass(plannedStatus)}>{plannedStatus}</span>
        </td>

        {/* 출근 — 예정/실제/상태 합산 */}
        <td className={cell}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-[10px] font-medium text-muted-foreground/70">예정</span>
              <span className={`${mono} text-xs text-muted-foreground`}>
                {plannedStartHm ?? '—'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-5 shrink-0 text-[10px] font-medium text-muted-foreground/70">실제</span>
              <span className={`${mono} text-[13px] font-semibold`}>
                {actualInHm ?? <span className="font-normal text-muted-foreground">—</span>}
              </span>
              {inStatus !== '-' ? (
                <span className={attendanceLabelClass(inStatus)}>{inStatus}</span>
              ) : null}
            </div>
          </div>
        </td>

        {/* 퇴근 — 예정/실제/상태 합산 */}
        <td className={cell}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="w-5 shrink-0 text-[10px] font-medium text-muted-foreground/70">예정</span>
              <span className={`${mono} text-xs text-muted-foreground`}>
                {plannedEndHm ?? '—'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-5 shrink-0 text-[10px] font-medium text-muted-foreground/70">실제</span>
              <span className={`${mono} text-[13px] font-semibold`}>
                {actualOutHm ?? <span className="font-normal text-muted-foreground">—</span>}
              </span>
              {outStatus !== '-' ? (
                <span className={attendanceLabelClass(outStatus)}>{outStatus}</span>
              ) : null}
            </div>
          </div>
        </td>

        {/* 근무시간 */}
        <td className={`${cell} ${mono} ${muted}`}>{duration}</td>

        {/* 조작 */}
        <td className={cell}>
          <div className="flex flex-wrap justify-end gap-1">
            {showPunch ? (
              <>
                <Button
                  size="sm"
                  type="button"
                  className="h-6 px-2 text-xs"
                  disabled={punchIn.isPending || hasActualPunchIn}
                  onClick={() => void handlePunchIn()}
                >
                  출근
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  className="h-6 px-2 text-xs"
                  disabled={punchOut.isPending || !hasActualPunchIn || hasActualPunchOut}
                  onClick={() => void handlePunchOut()}
                >
                  퇴근
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              type="button"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={!editableId || editMode}
              onClick={openEdit}
            >
              수정
            </Button>
          </div>
        </td>
      </tr>
      {editMode ? (
        <tr className="bg-muted/20 border-border/50 border-b">
          <td colSpan={6} className="px-2 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">{staffName} 시각 수정</span>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">출근</span>
                <Input
                  type="time"
                  className="h-7 w-28 px-1 py-0 text-xs"
                  value={editIn}
                  onChange={(e) => setEditIn(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">퇴근</span>
                <Input
                  type="time"
                  className="h-7 w-28 px-1 py-0 text-xs"
                  value={editOut}
                  onChange={(e) => setEditOut(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                type="button"
                className="h-7 px-2 text-xs"
                disabled={correctAttendance.isPending || deleteAttendance.isPending}
                onClick={() => void handleSaveEdit()}
              >
                저장
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={cancelEdit}
              >
                취소
              </Button>
              <Button
                size="sm"
                type="button"
                variant="destructive"
                className="h-7 px-2 text-xs"
                disabled={correctAttendance.isPending || deleteAttendance.isPending || !editableId}
                onClick={() => void handleDeleteRecord()}
              >
                삭제
              </Button>
              {editError ? (
                <span className="text-destructive">{editError}</span>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
      {punchError ? (
        <tr>
          <td colSpan={6} className="text-destructive px-2 py-1 text-xs">
            {punchError}
          </td>
        </tr>
      ) : null}
    </>
  )
}

function AttendanceTableHead() {
  const th =
    'border-border/50 border-b bg-muted/30 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
  return (
    <thead>
      <tr>
        <th className={th}>근무자</th>
        <th className={th}>근태</th>
        <th className={th}>출근 (예정 / 실제)</th>
        <th className={th}>퇴근 (예정 / 실제)</th>
        <th className={th}>근무시간</th>
        <th className={`${th} text-right`}>조작</th>
      </tr>
    </thead>
  )
}

function TodayGanttChart({
  staffList,
  plannedMap,
  todayGroup,
  todayKey,
}: {
  staffList: Array<{ id: string; name: string }>
  plannedMap: Map<string, PlannedWorkDetail>
  todayGroup: { blocks: StaffDayBlock[] } | undefined
  todayKey: string
}) {
  const scheduled = staffList.filter((s) => plannedMap.has(`${s.id}_${todayKey}`))
  if (scheduled.length === 0) return null

  const allMins = scheduled.flatMap((s) => {
    const p = plannedMap.get(`${s.id}_${todayKey}`)!
    return [hmToMin(p.startHm), hmToMin(p.endHm)].filter((m): m is number => m != null)
  })
  if (allMins.length === 0) return null

  const minHour = Math.floor(Math.min(...allMins) / 60)
  const maxHour = Math.ceil(Math.max(...allMins) / 60)
  const chartStartMin = minHour * 60
  const totalMins = (maxHour - minHour) * 60
  if (totalMins <= 0) return null

  const pct = (m: number) =>
    Math.max(0, Math.min(100, ((m - chartStartMin) / totalMins) * 100))

  const hourCount = maxHour - minHour

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNowLine = nowMin >= chartStartMin && nowMin <= chartStartMin + totalMins

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="flex">
        {/* 이름 열 */}
        <div className="w-[68px] shrink-0 border-r border-border/40">
          <div className="h-7 border-b border-border/40 bg-muted/30" />
          {scheduled.map((s) => (
            <div
              key={s.id}
              className="flex h-10 items-center border-b border-border/15 px-2 last:border-b-0"
            >
              <span className="truncate text-xs font-medium">{s.name}</span>
            </div>
          ))}
        </div>

        {/* 타임라인 */}
        <div className="relative min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-[320px]">
            {/* 시간 헤더 */}
            <div className="flex h-7 border-b border-border/40 bg-muted/30">
              {Array.from({ length: hourCount }, (_, i) => (
                <div key={i} className="flex-1 border-l border-border/30 px-1">
                  <span className="text-[10px] leading-7 text-muted-foreground">
                    {minHour + i}시
                  </span>
                </div>
              ))}
            </div>

            {/* 직원 행 */}
            {scheduled.map((s) => {
              const planned = plannedMap.get(`${s.id}_${todayKey}`)!
              const block = todayGroup?.blocks.find((b) => b.staff_id === s.id)
              const actualIn = block?.actual?.check_in ?? null
              const actualOut = block?.actual?.check_out ?? null

              const ps = hmToMin(planned.startHm)
              const pe = hmToMin(planned.endHm)
              const asm = actualIn ? isoLocalMin(actualIn) : null
              const aem = actualOut ? isoLocalMin(actualOut) : null

              const pLeft = ps != null ? pct(ps) : null
              const pWidth = ps != null && pe != null ? pct(pe) - pct(ps) : null
              const aLeft = asm != null ? pct(asm) : null
              const aWidth = asm != null && aem != null ? pct(aem) - pct(asm) : null

              return (
                <div
                  key={s.id}
                  className="relative h-[52px] border-b border-border/15 last:border-b-0"
                >
                  {/* 격자 선 */}
                  {Array.from({ length: hourCount - 1 }, (_, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute inset-y-0 w-px bg-border/25"
                      style={{ left: `${pct((minHour + i + 1) * 60)}%` }}
                    />
                  ))}

                  {/* 예정 바 — 상단 절반, 회색 아웃라인 */}
                  {pLeft != null && pWidth != null && pWidth > 0 && (
                    <div
                      className="absolute top-[5px] h-[18px] rounded bg-muted-foreground/10 ring-1 ring-inset ring-muted-foreground/30"
                      style={{ left: `${pLeft}%`, width: `${pWidth}%` }}
                    />
                  )}

                  {/* 실제 바 — 하단 절반, 초록 솔리드 */}
                  {aLeft != null && (
                    <div
                      className="absolute bottom-[5px] h-[18px] rounded bg-primary/70"
                      style={{
                        left: `${aLeft}%`,
                        width: aWidth != null && aWidth > 0 ? `${aWidth}%` : '4px',
                      }}
                    />
                  )}
                </div>
              )
            })}

            {/* 현재 시각 선 */}
            {showNowLine && (
              <div
                className="pointer-events-none absolute top-7 bottom-0 w-[1.5px] bg-rose-500/60"
                style={{ left: `${pct(nowMin)}%` }}
              />
            )}
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 border-t border-border/30 bg-muted/10 px-4 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="h-3.5 w-7 rounded bg-muted-foreground/10 ring-1 ring-inset ring-muted-foreground/30" />
          <span className="text-[10px] text-muted-foreground">예정</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-7 rounded bg-primary/70" />
          <span className="text-[10px] text-muted-foreground">실제</span>
        </div>
        {showNowLine && (
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-[1.5px] rounded-full bg-rose-500/60" />
            <span className="text-[10px] text-muted-foreground">현재 시각</span>
          </div>
        )}
      </div>
    </div>
  )
}

function StaffAttendanceSection() {
  const todayKey = formatYmdLocal(new Date())
  // 기본 기간: 이번 주 월~일 (오늘이 포함된 주)
  const thisWeekStart = formatYmdLocal(startOfIsoWeekMonday(new Date()))
  const thisWeekEnd = formatYmdLocal(
    addDaysLocal(parseYmdLocal(thisWeekStart), 6),
  )

  const [rangeFrom, setRangeFrom] = useState(thisWeekStart)
  const [rangeTo, setRangeTo] = useState(thisWeekEnd)

  const { data: store } = useStoreQuery()
  const storeId = store?.id
  const { data: staffList } = useStaffList()

  // 기간 정상화 (from > to 면 swap). 오늘 포함 보장을 위해 effectiveFrom/effectiveTo 분리.
  const [effFrom, effTo] = useMemo(() => {
    if (!rangeFrom || !rangeTo) return [rangeFrom, rangeTo] as const
    return rangeFrom <= rangeTo
      ? ([rangeFrom, rangeTo] as const)
      : ([rangeTo, rangeFrom] as const)
  }, [rangeFrom, rangeTo])

  // 기간 데이터(이전 기록용)
  const { data: rangeRows } = useAttendanceList({
    from: effFrom || undefined,
    to: effTo || undefined,
  })
  // 오늘 데이터는 항상 별도 조회 — 기간 필터와 독립적으로 상단 고정.
  const { data: todayRows } = useAttendanceList({
    from: todayKey,
    to: todayKey,
  })

  const { data: shiftStore } = useShiftTimeSettings()
  const settings = shiftStore?.settings ?? DEFAULT_SHIFT_TIME_SETTINGS

  const groupedRange = useMemo(
    () => groupAttendanceByDateStaff(rangeRows ?? []),
    [rangeRows],
  )
  const groupedToday = useMemo(
    () => groupAttendanceByDateStaff(todayRows ?? []),
    [todayRows],
  )

  // 주간 슬롯(예정) 도출에 필요한 weekStart 집합 — 오늘 + 기간 + 그룹 데이터 전부 커버.
  const weekStartsNeeded = useMemo(() => {
    const set = new Set<string>()
    set.add(formatYmdLocal(startOfIsoWeekMonday(new Date())))
    if (effFrom)
      set.add(formatYmdLocal(startOfIsoWeekMonday(parseYmdLocal(effFrom))))
    if (effTo)
      set.add(formatYmdLocal(startOfIsoWeekMonday(parseYmdLocal(effTo))))
    for (const g of groupedRange) {
      set.add(formatYmdLocal(startOfIsoWeekMonday(parseYmdLocal(g.dateKey))))
    }
    return [...set]
  }, [groupedRange, effFrom, effTo])

  const slotQueries = useQueries({
    queries: weekStartsNeeded.map((ws) => ({
      queryKey: ['weekSchedule', storeId, ws] as const,
      queryFn: () => fetchWeekSlots(storeId!, ws),
      enabled: Boolean(storeId),
    })),
  })

  const plannedMap = useMemo(() => {
    const data = slotQueries.map((q) => q.data)
    return mergePlannedByStaffDate(weekStartsNeeded, data, settings)
  }, [weekStartsNeeded, slotQueries, settings])

  function dateHeading(dateKey: string) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const wd = DOW_KO[new Date(y, m - 1, d).getDay()]
    return `${dateKey} (${wd})`
  }

  /** 기간 안의 모든 날짜를 YYYY-MM-DD 배열로 펼친다(오늘 제외). 데이터가 없는 날짜도 카드로 표시하기 위함. */
  const rangeDateKeys = useMemo(() => {
    if (!effFrom || !effTo) return [] as string[]
    const out: string[] = []
    const start = parseYmdLocal(effFrom)
    const end = parseYmdLocal(effTo)
    const cursor = new Date(start)
    cursor.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)
    let safety = 0
    while (cursor <= end && safety < 366) {
      const k = formatYmdLocal(cursor)
      if (k !== todayKey) out.push(k)
      cursor.setDate(cursor.getDate() + 1)
      safety++
    }
    // 시작일→종료일 순(오름차순). 루프 순서가 이미 시간순이므로 추가 정렬 불필요.
    return out
  }, [effFrom, effTo, todayKey])

  function setThisWeek() {
    setRangeFrom(thisWeekStart)
    setRangeTo(thisWeekEnd)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">출퇴근 기록</CardTitle>
        <CardDescription>
          «근무표»에 저장된 주간 슬롯이 예정(계획)으로 표시됩니다. 실제는 출근·퇴근
          기록입니다.{' '}
          <span className="text-muted-foreground">
            (GPS 권장은 실서비스 단계)
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 1) 오늘 — 기간 필터와 무관하게 항상 상단 고정 */}
        <section>
          <p className="mb-3 text-sm font-medium">오늘 ({todayKey})</p>
          <TodayGanttChart
            staffList={staffList ?? []}
            plannedMap={plannedMap}
            todayGroup={groupedToday.find((d) => d.dateKey === todayKey)}
            todayKey={todayKey}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] border-collapse text-sm">
              <AttendanceTableHead />
              <tbody>
                {(staffList ?? []).map((s) => {
                  const todayGroup = groupedToday.find(
                    (d) => d.dateKey === todayKey,
                  )
                  return (
                    <PersonRow
                      key={`${todayKey}-${s.id}`}
                      dateKey={todayKey}
                      staffId={s.id}
                      staffName={s.name}
                      showPunch={true}
                      block={todayGroup?.blocks.find(
                        (b) => b.staff_id === s.id,
                      )}
                      planned={plannedMap.get(`${s.id}_${todayKey}`)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 2) 날짜 셀렉 UI */}
        <section className="border-border/60 rounded-lg border bg-muted/10 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">시작 날짜</span>
              <Input
                type="date"
                className="h-9 w-[160px]"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground pb-2">~</span>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">종료 날짜</span>
              <Input
                type="date"
                className="h-9 w-[160px]"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={setThisWeek}
            >
              이번 주
            </Button>
          </div>
        </section>

        {/* 3) 셀렉한 기간의 일별 카드 — 오늘은 제외. 과거는 회색, 미래는 그대로. */}
        <section className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            이전 기록 ({effFrom || '—'} ~ {effTo || '—'})
          </p>
          {rangeDateKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              해당 기간의 기록이 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {rangeDateKeys.map((dateKey) => {
                const isPast = dateKey < todayKey
                const dayGroup = groupedRange.find(
                  (d) => d.dateKey === dateKey,
                )
                return (
                  <div
                    key={dateKey}
                    className={cn(
                      'border-border/60 rounded-xl border bg-card p-3 shadow-sm',
                      isPast && 'opacity-60',
                    )}
                  >
                    <div
                      className={cn(
                        'mb-2 flex items-center gap-2',
                        isPast ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      <span aria-hidden className="text-base">
                        📅
                      </span>
                      <span className="text-sm font-medium">
                        {dateHeading(dateKey)}
                      </span>
                      {isPast ? (
                        <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none">
                          과거
                        </span>
                      ) : null}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[580px] border-collapse text-sm">
                        <AttendanceTableHead />
                        <tbody>
                          {(staffList ?? []).map((s) => (
                            <PersonRow
                              key={`${dateKey}-${s.id}`}
                              dateKey={dateKey}
                              staffId={s.id}
                              staffName={s.name}
                              showPunch={false}
                              block={dayGroup?.blocks.find(
                                (b) => b.staff_id === s.id,
                              )}
                              planned={plannedMap.get(`${s.id}_${dateKey}`)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function StaffChecklistSection() {
  const [shift, setShift] = useState<ShiftCode>('open')
  const [staffId, setStaffId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const { data: staffList } = useStaffList()
  const { data: items } = useChecklistItems(shift)
  const { data: completion, refetch } = useChecklistCompletionToday(shift, staffId || undefined)
  const completeMut = useCompleteChecklistItem()
  const createItem = useCreateChecklistItem()
  const deleteItem = useDeleteChecklistItem()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">시간대별 체크리스트</CardTitle>
        <CardDescription>
          항목은 매장 공통입니다. 완료 시 로그가 쌓입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>근무 구간</Label>
            <select
              className="border-input h-9 rounded-lg border px-2 text-sm"
              value={shift}
              onChange={(e) => setShift(e.target.value as ShiftCode)}
            >
              <option value="open">오픈</option>
              <option value="middle">미들</option>
              <option value="close">마감</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label>담당 직원</Label>
            <select
              className="border-input h-9 rounded-lg border px-2 text-sm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">선택…</option>
              {staffList?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="새 체크 항목"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              void createItem
                .mutateAsync({ shift, title: newTitle })
                .then(() => setNewTitle(''))
            }
          >
            항목 추가
          </Button>
        </div>

        <ul className="space-y-2">
          {items?.map((it) => (
            <li
              key={it.id}
              className="flex flex-wrap items-start gap-3 rounded-lg border border-border/50 p-3"
            >
              <input
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                disabled={!staffId}
                checked={completion?.doneIds.has(it.id) ?? false}
                onChange={() => {
                  if (!staffId) return
                  if (completion?.doneIds.has(it.id)) return
                  void completeMut
                    .mutateAsync({
                      checklistItemId: it.id,
                      staffId,
                      shift,
                    })
                    .then(() => refetch())
                }}
              />
              <label className="flex-1 text-sm leading-relaxed">{it.title}</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() =>
                  void deleteItem.mutateAsync({ id: it.id, shift })
                }
              >
                삭제
              </Button>
            </li>
          ))}
        </ul>
        {!items?.length ? (
          <p className="text-sm text-muted-foreground">등록된 항목이 없습니다.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
