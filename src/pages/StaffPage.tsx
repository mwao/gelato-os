import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueries } from '@tanstack/react-query'

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
  shiftBadgeClass,
  shiftForSlotIndex,
  startOfIsoWeekMonday,
  type ShiftTimeSettings,
  weekSlotBandBgClass,
  WEEK_SLOT_LABELS,
} from '@/lib/dateUtils'
import { groupAttendanceByDateStaff } from '@/lib/attendanceDisplay'
import {
  mergePlannedByStaffDate,
  diffPlannedVsActualCheckIn,
} from '@/lib/plannedFromWeek'
import { cn } from '@/lib/utils'
import {
  useAttendanceList,
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
import {
  usePersistWeekDraft,
  useApplyWeekFromProfileDefaults,
  useWeekSlots,
  fetchWeekSlots,
} from '@/hooks/useWeekSchedule'

type StaffTab = 'profile' | 'schedule' | 'ta' | 'checklist'

const SHIFT_OPTIONS: ShiftCode[] = ['open', 'middle', 'close']

export function StaffPage() {
  const [tab, setTab] = useState<StaffTab>('profile')
  const { data: store } = useStoreQuery()
  const storeId = store?.id
  const ensureTypes = useEnsureDefaultEmploymentTypes()
  const { isLoading: emplLoading } = useEmploymentTypes()

  /** 매장당 1회만 시드 시도. `[storeId, ensureTypes]` 넣지 않음 — mutation 반환 객체가 렌더마다 바뀌면 effect가 매번 돌아 mutation 안의 fetchTypes(GET)가 무한 반복됨. */
  const employmentSeedAttemptedForStore = useRef<string | null>(null)
  useEffect(() => {
    if (!storeId) return
    if (employmentSeedAttemptedForStore.current === storeId) return
    employmentSeedAttemptedForStore.current = storeId
    void ensureTypes.mutateAsync().catch(() => {
      employmentSeedAttemptedForStore.current = null
    })
  }, [storeId])

  const tabBtn = (id: StaffTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        'rounded-lg px-3 py-2 text-[13px] transition-colors',
        tab === id
          ? 'bg-primary/15 font-medium text-primary'
          : 'text-muted-foreground hover:bg-muted/80',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        인력·근무표·출퇴근·체크리스트는 설계서 Feature 3 스키마와 연결됩니다. 최초 사용 전{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          supabase/sql/feature3_hr_tables.sql
        </code>{' '}
        를 Supabase에서 실행해 주세요.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-border/60 pb-px">
        {tabBtn('profile', '직원 프로필')}
        {tabBtn('schedule', '근무표')}
        {tabBtn('ta', '출퇴근')}
        {tabBtn('checklist', '체크리스트')}
      </div>

      {emplLoading ? (
        <AuthLoading />
      ) : (
        <>
          {tab === 'profile' ? <StaffProfileSection /> : null}
          {tab === 'schedule' ? <StaffScheduleSection /> : null}
          {tab === 'ta' ? <StaffAttendanceSection /> : null}
          {tab === 'checklist' ? <StaffChecklistSection /> : null}
        </>
      )}
    </div>
  )
}

function StaffProfileSection() {
  const { data: staffList, isLoading, isError, error, refetch } = useStaffList()
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  if (view === 'detail' && selectedId) {
    return (
      <StaffDetailForm
        staffId={selectedId}
        onClose={() => {
          setView('list')
          setSelectedId(null)
        }}
        onSaved={() => {
          setView('list')
          setSelectedId(null)
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          onClick={() => {
            setSelectedId('new')
            setView('detail')
          }}
        >
          새 직원
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">직원 목록</CardTitle>
          <CardDescription>이름을 누르면 상세에서 수정할 수 있습니다.</CardDescription>
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
                <tr key={s.id} className="border-b border-border/40">
                  <td className="py-2">
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        setSelectedId(s.id)
                        setView('detail')
                      }}
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
            ← 목록
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

  const [pickStaff, setPickStaff] = useState<string>('')
  const { data: staffList } = useStaffList()
  const { data: shiftStoreSettings, refetch: refetchShiftSettings } =
    useShiftTimeSettings()
  const shiftSettings = shiftStoreSettings?.settings

  const applyFromProfile = useApplyWeekFromProfileDefaults()
  const persistWeek = usePersistWeekDraft()
  const { data: slots, refetch: refetchWeek } = useWeekSlots(weekStart)
  const genBase = useGenerateAttendanceBaseline()

  const weekDragRef = useRef<{ day: number } | null>(null)
  const [weekDraft, setWeekDraft] = useState<Record<string, string[]>>({})

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
      alert('먼저 근무자를 선택해 주세요.')
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
              근무자를 선택한 뒤 셀을 누르거나 같은 요일(열) 안에서 드래그하면 연속 슬롯에
              배정합니다. «저장» 시 확인 후 반영되며, 저장된 표가 출퇴근 «예정» 시간과
              연동됩니다. 시간대 행·이름 칩 색은 «근무관리» 오픈·미들·마감 구간과 같습니다.
              «근무표 가져오기»는 각 직원 프로필의 근무요일·시프트를 근무관리 시간대로 풀어
              이번 주에 채운 뒤, 기준 출퇴근 행을 생성합니다.
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
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-muted-foreground text-sm">근무자 선택</span>
              <select
                className="border-input h-9 max-w-[220px] rounded-lg border bg-background px-2 text-sm"
                value={pickStaff}
                onChange={(e) => setPickStaff(e.target.value)}
              >
                <option value="">선택…</option>
                {staffList?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  applyFromProfile.isPending ||
                  genBase.isPending ||
                  !shiftSettings
                }
                onClick={() => {
                  if (!shiftSettings) return
                  void (async () => {
                    try {
                      const r = await applyFromProfile.mutateAsync({
                        weekStart,
                        settings: shiftSettings,
                      })
                      await refetchWeek()
                      const n = await genBase.mutateAsync(weekStart)
                      window.alert(
                        `프로필 근무요일 반영: 슬롯 배정 ${r.placed}건 (근무 규칙이 있는 직원 ${r.staffWithRules}명 참고). 기준 출퇴근 ${n}건 생성.`,
                      )
                    } catch (e) {
                      window.alert(
                        `처리에 실패했습니다. ${getPostgrestMessage(e)}`,
                      )
                    }
                  })()
                }}
              >
                근무표 가져오기
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={persistWeek.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      '근무표를 저장하시겠습니까?\n\n저장한 내용은 출퇴근 기록의 예정 시간·기준 데이터와 연동됩니다.',
                    )
                  )
                    return
                  void persistWeek
                    .mutateAsync({ weekStart, draft: weekDraft })
                    .then(() =>
                      window.alert('주간 근무표가 저장되었습니다.'),
                    )
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
            <div className="overflow-x-auto">
              <table
                className="w-full min-w-[720px] border-collapse text-xs"
                onMouseLeave={() => {
                  weekDragRef.current = null
                }}
              >
                <thead>
                  <tr>
                    <th className="border border-border/50 bg-muted/40 px-1 py-1 text-left">
                      시간
                    </th>
                    {DOW_KO.map((d) => (
                      <th
                        key={d}
                        className="border border-border/50 bg-muted/40 px-1 py-1"
                      >
                        {d}
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
                        const ids = weekDraft[k] ?? []
                        return (
                          <td
                            key={dayIdx}
                            className={cn(
                              'border border-border/50 p-1 align-top select-none',
                              !past && weekSlotBandBgClass(slotBand),
                              past && 'bg-muted/50 opacity-60',
                            )}
                            onMouseDown={() =>
                              !past ? onWeekCellMouseDown(dayIdx, slotIdx) : undefined
                            }
                            onMouseEnter={() => onWeekCellMouseEnter(dayIdx, slotIdx)}
                          >
                            <div className="flex min-h-[52px] w-full min-w-0 flex-col gap-1">
                              {ids.map((sid) => {
                                const name =
                                  staffList?.find((x) => x.id === sid)?.name ?? sid
                                return (
                                  <div
                                    key={sid}
                                    className={cn(
                                      'flex w-full min-w-0 items-stretch gap-0.5 rounded-md border border-border/50 px-1.5 py-1 pl-2 text-[11px] leading-snug shadow-sm',
                                      shiftBadgeClass(slotBand ?? ''),
                                    )}
                                  >
                                    <span className="min-w-0 flex-1 truncate font-medium">
                                      {name}
                                    </span>
                                    {!past ? (
                                      <button
                                        type="button"
                                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/15 active:bg-destructive/25"
                                        title="이 슬롯에서 제거"
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
                                          className="text-lg font-light leading-none"
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

function StaffAttendanceSection() {
  const [filterDate, setFilterDate] = useState('')
  const { data: store } = useStoreQuery()
  const storeId = store?.id
  const { data: staffList } = useStaffList()
  const { data: rows, refetch } = useAttendanceList({
    from: filterDate || undefined,
    to: filterDate || undefined,
  })
  const { data: shiftStore } = useShiftTimeSettings()
  const settings =
    shiftStore?.settings ?? DEFAULT_SHIFT_TIME_SETTINGS

  const punchIn = usePunchIn()
  const punchOut = usePunchOut()

  const grouped = useMemo(
    () => groupAttendanceByDateStaff(rows ?? []),
    [rows],
  )

  const todayKey = formatYmdLocal(new Date())

  const weekStartsNeeded = useMemo(() => {
    const set = new Set<string>()
    set.add(formatYmdLocal(startOfIsoWeekMonday(new Date())))
    for (const g of grouped) {
      set.add(
        formatYmdLocal(startOfIsoWeekMonday(parseYmdLocal(g.dateKey))),
      )
    }
    return [...set]
  }, [grouped])

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

  function fmtShort(ts: string | null) {
    if (!ts) return '—'
    try {
      const d = new Date(ts)
      return d.toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ts
    }
  }

  function dateHeading(dateKey: string) {
    const [y, m, d] = dateKey.split('-').map(Number)
    const wd = DOW_KO[new Date(y, m - 1, d).getDay()]
    return `${dateKey} (${wd})`
  }

  function mergeStaffIdsForDate(
    dateKey: string,
    blockList: { staff_id: string }[],
  ) {
    const set = new Set<string>()
    for (const b of blockList) set.add(b.staff_id)
    for (const s of staffList ?? []) {
      if (plannedMap.has(`${s.id}_${dateKey}`)) set.add(s.id)
    }
    return [...set].sort((a, b) => {
      const na = staffList?.find((x) => x.id === a)?.name ?? a
      const nb = staffList?.find((x) => x.id === b)?.name ?? b
      return na.localeCompare(nb, 'ko')
    })
  }

  const pastGroups = useMemo(() => {
    let g = grouped.filter((x) => x.dateKey < todayKey)
    if (filterDate) g = g.filter((x) => x.dateKey === filterDate)
    else g = g.slice(0, 12)
    return g
  }, [grouped, filterDate, todayKey])

  function renderPersonBlock(
    dateKey: string,
    staffId: string,
    staffName: string,
    showPunch: boolean,
  ) {
    const block = grouped
      .find((d) => d.dateKey === dateKey)
      ?.blocks.find((b) => b.staff_id === staffId)
    const planned = plannedMap.get(`${staffId}_${dateKey}`)
    const plannedStr = planned
      ? `${dateKey} ${planned.rangeLabel} (${planned.bandLabel})`
      : '—'
    const actualIn = block?.actual?.check_in ?? null
    const actualOut = block?.actual?.check_out ?? null
    const pd =
      planned && actualIn
        ? diffPlannedVsActualCheckIn(planned.startHm, actualIn)
        : null

    return (
      <div
        key={`${dateKey}-${staffId}`}
        className="border-border/60 rounded-xl border bg-muted/10 p-3"
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{staffName}</span>
          {showPunch ? (
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button
                size="sm"
                type="button"
                disabled={punchIn.isPending}
                onClick={() =>
                  void punchIn.mutateAsync(staffId).then(() => refetch())
                }
              >
                출근
              </Button>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                disabled={punchOut.isPending || !actualIn}
                onClick={() =>
                  void punchOut.mutateAsync(staffId).then(() => refetch())
                }
              >
                퇴근
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className="text-primary w-10 shrink-0 font-medium">예정</span>
            <span className="text-foreground/90 min-w-0">{plannedStr}</span>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <span className="w-10 shrink-0 font-medium text-amber-800 dark:text-amber-200">
              실제
            </span>
            <span className="min-w-0">
              {actualIn ? (
                <>
                  {fmtShort(actualIn)} (출근)
                  {actualOut
                    ? ` ~ ${fmtShort(actualOut)} (퇴근)`
                    : ' ~ [퇴근 전]'}
                  {pd === 'late' ? (
                    <span className="text-destructive ml-1.5">지각</span>
                  ) : null}
                  {pd === 'early' ? (
                    <span className="ml-1.5 text-sky-700 dark:text-sky-300">
                      조기출근
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">출퇴근 기록 없음</span>
              )}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const showTodaySection = !filterDate || filterDate === todayKey
  const filterSingleDay = filterDate && filterDate !== ''
  const singleDayGroups = filterSingleDay
    ? grouped.filter((g) => g.dateKey === filterDate)
    : []

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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">날짜 이동</span>
          <Input
            type="date"
            className="max-w-[180px]"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFilterDate('')}
          >
            전체 보기
          </Button>
        </div>

        {filterSingleDay ? (
          <div>
            <p className="mb-3 text-xs font-medium text-muted-foreground">
              선택한 날짜
            </p>
            <div className="space-y-2">
              {(singleDayGroups.length
                ? mergeStaffIdsForDate(filterDate, singleDayGroups[0]!.blocks)
                : mergeStaffIdsForDate(filterDate, [])
              ).map((sid) =>
                renderPersonBlock(
                  filterDate,
                  sid,
                  staffList?.find((x) => x.id === sid)?.name ?? sid,
                  filterDate === todayKey,
                ),
              )}
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground">
                이전 기록{' '}
                <span className="font-normal">
                  (날짜별 · 주간 근무표 연동 예정)
                </span>
              </p>
              {pastGroups.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  이전 기록이 없습니다.
                </p>
              ) : (
                <div className="space-y-6">
                  {pastGroups.map((day) => (
                    <div key={day.dateKey} className="space-y-2">
                      <div className="flex items-center gap-2 border-b border-border/50 pb-1">
                        <span aria-hidden className="text-base">
                          📅
                        </span>
                        <span className="text-sm font-medium">
                          {dateHeading(day.dateKey)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {mergeStaffIdsForDate(day.dateKey, day.blocks).map(
                          (sid) =>
                            renderPersonBlock(
                              day.dateKey,
                              sid,
                              staffList?.find((x) => x.id === sid)?.name ??
                                sid,
                              false,
                            ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showTodaySection ? (
              <div>
                <p className="mb-3 text-sm font-medium">오늘 ({todayKey})</p>
                <div className="space-y-2">
                  {(staffList ?? []).map((s) =>
                    renderPersonBlock(todayKey, s.id, s.name, true),
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
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
