import type { MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router-dom'
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
  startOfIsoWeekMonday,
  type ShiftTimeSettings,
} from '@/lib/dateUtils'
import { groupAttendanceByDateStaff, type StaffDayBlock } from '@/lib/attendanceDisplay'
import {
  plannedFromMonthCells,
  type PlannedWorkDetail,
} from '@/lib/plannedFromWeek'
import { cn } from '@/lib/utils'
import {
  useAttendanceList,
  useCorrectAttendance,
  useDeleteAttendance,
  describeBaselineSyncSummary,
  useGenerateAttendanceBaselineForMonth,
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
import {
  useDeleteStaffShiftOverride,
  useStaffShiftOverridesFor,
  useUpsertStaffShiftOverride,
} from '@/hooks/useStaffShiftOverrides'
import { getShiftTimeForDay } from '@/lib/shiftResolver'
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
import {
  buildMonthDraftFromProfiles,
  useMonthCells,
  useMonthCellsDateRange,
  usePersistMonthScheduleDraft,
  type MonthDraftEntry,
} from '@/hooks/useMonthSchedule'

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
export function StaffSchedulePage({ hideWeek = false }: { hideWeek?: boolean } = {}) {
  return <StaffScheduleSection hideWeek={hideWeek} />
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

      <div
        className={cn(
          'grid gap-4',
          selectedId ? 'lg:grid-cols-[320px_minmax(0,1fr)]' : 'grid-cols-1',
        )}
      >
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">직원 목록</CardTitle>
            <CardDescription>
              이름을 누르면 {selectedId ? '오른쪽 패널에서' : '오른쪽 상세 패널이 열리며'} 바로 수정할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="pb-2 font-medium">이름</th>
                  <th className="pb-2 font-medium">고용형태</th>
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
                        className={cn(
                          'font-medium underline-offset-4 hover:underline',
                          selectedId === s.id ? 'text-primary' : 'text-foreground',
                        )}
                        onClick={() => openDetail(s.id)}
                      >
                        {s.name}
                      </button>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {s.employment_label ?? '—'}
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

        {selectedId ? (
          <div ref={detailRef} className="animate-in fade-in slide-in-from-left-2 duration-150">
            <StaffDetailForm
              staffId={selectedId}
              onClose={() => setSelectedId(null)}
              onSaved={() => setSelectedId(null)}
            />
          </div>
        ) : null}
      </div>
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
  const [baseSalary, setBaseSalary] = useState('')
  const [offDays, setOffDays] = useState('') // 빈값 = 고용형태 기본값 사용
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

  const selectedEmplType = useMemo(
    () => sortedEmplTypes.find((t) => t.id === emplId) ?? null,
    [sortedEmplTypes, emplId],
  )
  const payMode = selectedEmplType?.pay_mode ?? 'hourly'

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

  /** staffId가 'new'로 바뀔 때 폼 리셋 — 기존 직원 정보 잔류 방지 */
  useEffect(() => {
    if (!isNew) return
    setName('')
    setPhone('')
    setHourly('9860')
    setBaseSalary('')
    setOffDays('')
    setEmplId('')
    setHire('')
    setHealthExp('')
    setRules([])
    setFormErr(null)
  }, [isNew, staffId])

  useEffect(() => {
    if (!detail) return
    setName(detail.name)
    setPhone(detail.phone ?? '')
    setHourly(String(detail.hourly_rate))
    setBaseSalary(detail.base_salary == null ? '' : String(detail.base_salary))
    setOffDays(detail.monthly_off_days == null ? '' : String(detail.monthly_off_days))
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

    let hr = 0
    let bs: number | null = null
    let off: number | null = null
    if (payMode === 'salary') {
      const parsed = parseFloat(baseSalary.replace(/,/g, ''))
      if (Number.isNaN(parsed) || parsed < 0) {
        setFormErr('기본급을 확인해 주세요.')
        return
      }
      bs = parsed
      const trimmed = offDays.trim()
      if (trimmed.length > 0) {
        const parsedOff = parseInt(trimmed, 10)
        if (Number.isNaN(parsedOff) || parsedOff < 0 || parsedOff > 31) {
          setFormErr('월 휴무 의무는 0~31 사이 숫자여야 합니다.')
          return
        }
        off = parsedOff
      }
    } else {
      hr = parseFloat(hourly.replace(/,/g, ''))
      if (Number.isNaN(hr) || hr < 0) {
        setFormErr('시급을 확인해 주세요.')
        return
      }
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
          base_salary: bs,
          monthly_off_days: off,
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
          base_salary: bs,
          monthly_off_days: off,
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
                  {t.label} ({t.pay_mode === 'salary' ? '월급제' : '시급제'})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              고용형태를 바꾸면 아래 폼이 자동으로 «기본급» 또는 «시급» 모드로 전환됩니다.
            </p>
          </div>
          {payMode === 'salary' ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="st-base">기본급 (원)</Label>
                <Input
                  id="st-base"
                  inputMode="decimal"
                  placeholder="예: 3000000"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="st-offdays">월 휴무 의무 (회)</Label>
                <Input
                  id="st-offdays"
                  type="number"
                  min={0}
                  max={31}
                  placeholder={
                    selectedEmplType?.monthly_off_days != null
                      ? `기본 ${selectedEmplType.monthly_off_days}`
                      : '8'
                  }
                  value={offDays}
                  onChange={(e) => setOffDays(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  비우면 «{selectedEmplType?.label ?? '고용형태'}» 기본값(
                  {selectedEmplType?.monthly_off_days ?? 8}회)을 사용합니다.
                </p>
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="st-hourly">시급 (원)</Label>
              <Input
                id="st-hourly"
                inputMode="decimal"
                value={hourly}
                onChange={(e) => setHourly(e.target.value)}
              />
            </div>
          )}
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

        {payMode === 'hourly' && !isNew ? (
          <ShiftOverridesEditor staffId={staffId} />
        ) : payMode === 'hourly' && isNew ? (
          <p className="text-sm text-muted-foreground">
            저장 후 «시프트 시간» 개별 설정을 편집할 수 있습니다.
          </p>
        ) : null}

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

// ============================================================================
// 알바 개인별 시프트 시간 오버라이드 에디터
// ----------------------------------------------------------------------------
// hourly 모드(파트타임 등) 직원 프로필에서 표시. 매장기본 vs 개별설정 토글.
// ============================================================================

function ShiftOverridesEditor({ staffId }: { staffId: string }) {
  const { data: storeShift } = useShiftTimeSettings()
  const defaults = storeShift?.settings ?? DEFAULT_SHIFT_TIME_SETTINGS
  const { data: overrides, isLoading } = useStaffShiftOverridesFor(staffId)
  const upsert = useUpsertStaffShiftOverride()
  const del = useDeleteStaffShiftOverride()

  const [editing, setEditing] = useState<Record<ShiftCode, { start: string; end: string } | null>>({
    open: null,
    middle: null,
    close: null,
  })

  function startEdit(shift: ShiftCode) {
    const existing = overrides?.find((o) => o.shift === shift)
    setEditing((prev) => ({
      ...prev,
      [shift]: existing
        ? { start: existing.start_time, end: existing.end_time }
        : { start: defaults[shift].start, end: defaults[shift].end },
    }))
  }

  function cancelEdit(shift: ShiftCode) {
    setEditing((prev) => ({ ...prev, [shift]: null }))
  }

  async function saveEdit(shift: ShiftCode) {
    const v = editing[shift]
    if (!v) return
    try {
      await upsert.mutateAsync({
        staff_id: staffId,
        shift,
        start_time: v.start,
        end_time: v.end,
      })
      setEditing((prev) => ({ ...prev, [shift]: null }))
    } catch (e) {
      window.alert(`저장 실패: ${getPostgrestMessage(e)}`)
    }
  }

  async function removeOverride(shift: ShiftCode) {
    try {
      await del.mutateAsync({ staff_id: staffId, shift })
      setEditing((prev) => ({ ...prev, [shift]: null }))
    } catch (e) {
      window.alert(`삭제 실패: ${getPostgrestMessage(e)}`)
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <p className="mb-1 text-sm font-medium">시프트 시간</p>
      <p className="mb-3 text-xs text-muted-foreground">
        매장 기본값과 다를 때만 «개별설정»으로 시간을 지정합니다. 출퇴근 예정·급여 계산
        시 이 시간을 우선 적용합니다.
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : (
        <div className="space-y-2">
          {(['open', 'middle', 'close'] as const).map((shift) => {
            const existing = overrides?.find((o) => o.shift === shift) ?? null
            const draft = editing[shift]
            const def = defaults[shift]
            const isEditing = draft !== null
            return (
              <div
                key={shift}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card p-2"
              >
                <span className="min-w-[48px] text-sm font-medium">{SHIFT_LABEL[shift]}</span>
                {isEditing ? (
                  <>
                    <Input
                      type="time"
                      className="h-8 w-[110px]"
                      value={draft.start}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [shift]: { ...draft, start: e.target.value },
                        }))
                      }
                    />
                    <span className="text-muted-foreground text-xs">~</span>
                    <Input
                      type="time"
                      className="h-8 w-[110px]"
                      value={draft.end}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [shift]: { ...draft, end: e.target.value },
                        }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveEdit(shift)}
                      disabled={upsert.isPending}
                    >
                      저장
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => cancelEdit(shift)}
                    >
                      취소
                    </Button>
                  </>
                ) : existing ? (
                  <>
                    <span className="text-sm tabular-nums">
                      {existing.start_time} ~ {existing.end_time}
                    </span>
                    <span className="text-xs text-primary">(개별설정)</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => startEdit(shift)}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void removeOverride(shift)}
                      disabled={del.isPending}
                    >
                      매장기본 사용
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {def.start} ~ {def.end}
                    </span>
                    <span className="text-xs text-muted-foreground">(매장기본)</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={() => startEdit(shift)}
                    >
                      개별설정
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StaffScheduleSection({ hideWeek = false }: { hideWeek?: boolean }) {
  const [sub, setSub] = useState<'month' | 'week' | 'settings'>('month')

  const { data: store } = useStoreQuery()
  const storeId = store?.id
  const { data: staffList } = useStaffList()
  const { data: emplTypes } = useEmploymentTypes()

  /** 월간 휴무 현황 패널 + 근무자 박스 그룹화용 join */
  const staffListWithPay = useMemo(() => {
    const typeById = new Map(emplTypes?.map((t) => [t.id, t]) ?? [])
    return (staffList ?? []).map((s) => {
      const type = s.employment_type_id ? typeById.get(s.employment_type_id) ?? null : null
      const requiredOffDays = s.monthly_off_days ?? type?.monthly_off_days ?? null
      return {
        id: s.id,
        name: s.name,
        pay_mode: type?.pay_mode ?? null,
        requiredOffDays,
        employmentCode: type?.code ?? null,
        employmentLabel: type?.label ?? null,
      }
    })
  }, [staffList, emplTypes])

  const { data: shiftStoreSettings, refetch: refetchShiftSettings } =
    useShiftTimeSettings()
  const shiftSettings = shiftStoreSettings?.settings

  const updateShiftSettings = useUpdateShiftTimeSettings()
  const [editShift, setEditShift] = useState<ShiftTimeSettings | null>(null)
  useEffect(() => {
    if (shiftSettings) setEditShift(shiftSettings)
  }, [shiftSettings])

  // 월간 근무표
  const [monthYm, setMonthYm] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthDraft, setMonthDraft] = useState<Record<string, MonthDraftCell>>({})
  const [monthSaving, setMonthSaving] = useState(false)
  const [applyingDefaults, setApplyingDefaults] = useState(false)

  const { data: monthCells, isLoading: monthLoading } = useMonthCells(
    sub === 'month' ? monthYm : undefined,
  )
  const persistMonthDraft = usePersistMonthScheduleDraft()
  const genBaselineMonth = useGenerateAttendanceBaselineForMonth()

  const resetMonthDraftFromCells = useCallback(() => {
    const draft: Record<string, MonthDraftCell> = {}
    for (const c of monthCells ?? []) {
      draft[`${c.staff_id}|${c.work_date}`] = {
        shift: c.shift,
        start_time: c.start_time,
        end_time: c.end_time,
      }
    }
    setMonthDraft(draft)
  }, [monthCells])

  useEffect(() => {
    if (!monthCells) return
    resetMonthDraftFromCells()
  }, [monthCells, resetMonthDraftFromCells])

  return (
    <div className="space-y-6">
      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-muted/50 p-1 ring-1 ring-border/25 dark:bg-muted/35">
        <button
          type="button"
          className={cn(
            'rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200',
            sub === 'month'
              ? 'bg-background text-foreground shadow-sm ring-1 ring-black/[0.06] dark:bg-card dark:ring-white/[0.08]'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setSub('month')}
        >
          월간 근무표
        </button>
        {hideWeek ? null : (
          <button
            type="button"
            className={cn(
              'rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200',
              sub === 'week'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-black/[0.06] dark:bg-card dark:ring-white/[0.08]'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setSub('week')}
          >
            주간 근무표
          </button>
        )}
        <button
          type="button"
          className={cn(
            'rounded-full px-3.5 py-2 text-[13px] font-medium transition-all duration-200',
            sub === 'settings'
              ? 'bg-background text-foreground shadow-sm ring-1 ring-black/[0.06] dark:bg-card dark:ring-white/[0.08]'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setSub('settings')}
        >
          근무관리
        </button>
      </div>

      {sub === 'settings' ? (
        <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/25 to-transparent pb-4">
            <CardTitle className="text-lg font-semibold tracking-tight">
              근무관리 — 시프트 시간대
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              오픈·미들·마감의 기본 시작·종료 시각입니다. «근무표 가져오기» 시 직원 프로필
              근무요일·시프트를 이 구간에 맞춰 슬롯에 채웁니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {editShift ? (
              <>
                {(['open', 'middle', 'close'] as const).map((code) => (
                  <div
                    key={code}
                    className="flex flex-wrap items-end gap-3 rounded-xl bg-muted/25 p-4 shadow-sm ring-1 ring-border/25 dark:bg-muted/15"
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

      {sub === 'month' ? (
        <MonthScheduleGrid
          ym={monthYm}
          onYmChange={(v) => {
            setMonthYm(v)
            setMonthDraft({})
          }}
          staffList={staffListWithPay}
          cells={monthCells ?? []}
          draft={monthDraft}
          loading={monthLoading}
          saving={monthSaving}
          onCellApply={(staffId, workDate, nextValue) => {
            const key = `${staffId}|${workDate}`
            setMonthDraft((prev) => ({ ...prev, [key]: nextValue }))
          }}
          onApplyDefaults={async () => {
            if (!storeId) return
            if (
              !window.confirm(
                `${monthYm} 전체 초안을 직원 프로필 근무요일 기준으로 채웁니다.\n` +
                  `현재 편집 중인 초안의 수정사항은 사라지며, 「저장」을 눌러야 DB에 반영됩니다.\n계속할까요?`,
              )
            )
              return
            setApplyingDefaults(true)
            try {
              const cells = await buildMonthDraftFromProfiles(storeId, monthYm)
              const draft: Record<string, MonthDraftCell> = {}
              for (const c of cells) {
                draft[`${c.staff_id}|${c.work_date}`] = {
                  shift: c.shift,
                  start_time: c.start_time,
                  end_time: c.end_time,
                }
              }
              setMonthDraft(draft)
              window.alert(
                `초안에 반영했습니다 (배정 ${cells.length}건).\n«저장»을 눌러야 DB와 출퇴근 기준에 반영됩니다.`,
              )
            } catch (e) {
              window.alert(`실패: ${getPostgrestMessage(e)}`)
            } finally {
              setApplyingDefaults(false)
            }
          }}
          onSave={async () => {
            setMonthSaving(true)
            try {
              // v1.5.2: monthCells(DB)와 draft를 비교해 변경점만 entries에 포함
              const entries: MonthDraftEntry[] = []
              type CellRow = import('@/hooks/useMonthSchedule').MonthCellRow
              const dbByKey = new Map<string, CellRow>()
              for (const c of monthCells ?? []) {
                dbByKey.set(`${c.staff_id}|${c.work_date}`, c)
              }
              const draftKeys = new Set(Object.keys(monthDraft))

              // draft 순회 — 추가/수정/삭제
              for (const [key, val] of Object.entries(monthDraft)) {
                const [staffId, workDate] = key.split('|')
                if (!staffId || !workDate) continue
                const db = dbByKey.get(key)

                if (val === null) {
                  // draft에서 명시적으로 휴무 처리 → DB에 있으면 삭제
                  if (db) entries.push({ staffId, workDate, shift: null })
                } else if (!db) {
                  // DB에 없는 새 셀
                  entries.push({
                    staffId,
                    workDate,
                    shift: val.shift,
                    start_time: val.start_time,
                    end_time: val.end_time,
                  })
                } else {
                  // 변경 여부 비교
                  const sameShift = db.shift === val.shift
                  const sameStart = (db.start_time ?? null) === val.start_time
                  const sameEnd = (db.end_time ?? null) === val.end_time
                  if (!sameShift || !sameStart || !sameEnd) {
                    entries.push({
                      staffId,
                      workDate,
                      shift: val.shift,
                      start_time: val.start_time,
                      end_time: val.end_time,
                    })
                  }
                }
              }

              // DB엔 있지만 draft에 키 자체가 없는 경우 → 삭제
              for (const c of monthCells ?? []) {
                const key = `${c.staff_id}|${c.work_date}`
                if (!draftKeys.has(key)) {
                  entries.push({ staffId: c.staff_id, workDate: c.work_date, shift: null })
                }
              }

              if (entries.length === 0) {
                window.alert('변경된 내용이 없습니다.')
                return false
              }
              await persistMonthDraft.mutateAsync({ ym: monthYm, entries })
              // 월간 저장 후 출퇴근 baseline 자동 동기화 (A안)
              try {
                const summary = await genBaselineMonth.mutateAsync(monthYm)
                window.alert(
                  `월간 근무표가 저장되었습니다. (변경 ${entries.length}건)\n${describeBaselineSyncSummary(summary)}`,
                )
              } catch (e) {
                window.alert(
                  `월간 근무표는 저장되었으나 출퇴근 기준 생성에 실패했습니다. ${getPostgrestMessage(e)}`,
                )
              }
              return true
            } catch (e) {
              window.alert(`저장 실패: ${getPostgrestMessage(e)}`)
              return false
            } finally {
              setMonthSaving(false)
            }
          }}
          onResetDraft={resetMonthDraftFromCells}
          defaultsBusy={applyingDefaults}
          store={shiftStoreSettings?.store ?? null}
        />
      ) : null}

      {sub === 'week' ? (
        <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/25 to-transparent pb-4">
            <CardTitle className="text-lg font-semibold tracking-tight">
              주간 근무표 (읽기 전용)
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              주간 뷰는 시각화 전용입니다. 근무 배정은 «월간 근무표»에서 관리하며, 이곳에는
              자동으로 반영됩니다. 편집하려면 상단 «월간 근무표» 탭을 눌러 주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="rounded-2xl bg-amber-500/[0.07] p-5 text-sm text-amber-900 shadow-sm ring-1 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              <p className="font-medium">📌 데이터 단일화 안내 (v1.5 A안)</p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-800/90 dark:text-amber-200/90">
                <li>모든 근무 배정은 «월간 근무표»에서 저장됩니다.</li>
                <li>저장 시 출퇴근 기준 데이터(baseline)도 자동 생성됩니다.</li>
                <li>주간 뷰 시각화는 다음 세션에서 정교화될 예정입니다.</li>
              </ul>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                onClick={() => setSub('month')}
              >
                월간 근무표로 이동
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

// ============================================================================
// 월간 근무표 달력
// ============================================================================

/** 월간 칩 — 틴트 + 아주 약한 입체감 */
function monthShiftClass(shift: ShiftCode | null): string {
  if (shift === 'open')
    return 'border border-primary/45 bg-primary/[0.12] text-primary shadow-sm dark:border-primary/40 dark:bg-primary/[0.14] dark:text-primary'
  if (shift === 'middle')
    return 'border border-blue-500/40 bg-blue-500/[0.1] text-blue-950 shadow-sm dark:border-blue-400/40 dark:bg-blue-500/[0.12] dark:text-blue-50'
  if (shift === 'close')
    return 'border border-amber-500/40 bg-amber-500/[0.11] text-amber-950 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/[0.14] dark:text-amber-50'
  return ''
}

const DOW_CAL = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 월간 draft 셀 값.
 * null = 미배정(휴무). 객체 = 시프트 + 선택적 일별 시각 예외.
 */
type MonthDraftCell = {
  shift: ShiftCode
  start_time: string | null
  end_time: string | null
} | null

type MonthScheduleStaff = {
  id: string
  name: string
  pay_mode?: 'salary' | 'hourly' | null
  requiredOffDays?: number | null
  /** 고용형태 그룹 코드 — 'manager' | 'staff' | 'parttime' | 'other' | (custom) */
  employmentCode?: string | null
  /** 표시용 라벨 — '매니저' / '직원' 등 */
  employmentLabel?: string | null
}

/** 시급제 칩 — 월급제와 동일(테두리+옅은 틴트)으로 시각 언어 통일 */
function monthShiftTextOnlyClass(shift: ShiftCode | null): string {
  return monthShiftClass(shift)
}

/** HH:mm → 분 (월간 일별 타임라인용) */
function shiftHmToMinutes(hm: string): number | null {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10))
  if (Number.isNaN(h)) return null
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

/** 고용형태 그룹 우선순위: 매니저 → 직원 → 아르바이트 → 기타 → 커스텀 */
const EMPLOYMENT_GROUP_ORDER: { code: string; label: string }[] = [
  { code: 'manager', label: '매니저' },
  { code: 'staff', label: '직원' },
  { code: 'parttime', label: '아르바이트' },
  { code: 'other', label: '기타' },
]

function StaffPickerByEmployment({
  staffList,
  pickedStaffId,
  onPick,
}: {
  staffList: MonthScheduleStaff[]
  pickedStaffId: string | null
  onPick: (id: string | null) => void
}) {
  const pickedStaff = staffList.find((s) => s.id === pickedStaffId) ?? null

  // 고용형태 코드별로 묶기 — <optgroup> 순서에 사용
  const grouped = new Map<string, MonthScheduleStaff[]>()
  for (const s of staffList) {
    const code = s.employmentCode ?? 'other'
    if (!grouped.has(code)) grouped.set(code, [])
    grouped.get(code)!.push(s)
  }
  const orderedCodes: string[] = []
  for (const o of EMPLOYMENT_GROUP_ORDER) {
    if (grouped.has(o.code)) orderedCodes.push(o.code)
  }
  for (const code of [...grouped.keys()].sort()) {
    if (!orderedCodes.includes(code)) orderedCodes.push(code)
  }

  function labelFor(code: string): string {
    const std = EMPLOYMENT_GROUP_ORDER.find((o) => o.code === code)
    if (std) return std.label
    const first = grouped.get(code)?.[0]
    return first?.employmentLabel ?? code
  }

  return (
    <div className="rounded-2xl bg-muted/25 p-3 shadow-sm ring-1 ring-border/25 dark:bg-muted/15">
      <div className="mb-2 space-y-0.5 px-0.5">
        <span className="text-xs font-semibold tracking-tight">근무자 선택</span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          {pickedStaff
            ? `달력 칸 클릭 시 «${pickedStaff.name}»에게 적용됩니다`
            : '근무자를 1명 선택해야 셀 클릭이 동작합니다'}
        </span>
      </div>
      <select
        className={cn(
          'h-9 w-full rounded-xl border border-border/50 bg-background px-2.5 text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
          pickedStaffId
            ? 'text-foreground'
            : 'text-destructive',
        )}
        value={pickedStaffId ?? ''}
        onChange={(e) => onPick(e.target.value === '' ? null : e.target.value)}
      >
        <option value="">— 근무자 선택 —</option>
        {orderedCodes.map((code) => {
          const list = grouped.get(code) ?? []
          if (list.length === 0) return null
          return (
            <optgroup key={code} label={labelFor(code)}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </div>
  )
}

/**
 * 월간 근무표 필터 — 직원/고용형태/시프트 다중 토글.
 * Set이 비어 있으면 전체 통과, 하나라도 선택되면 그 항목만 통과.
 * `editMode === true`일 때만 헤더 우측 chevron으로 접기/펼치기 토글이 노출됨.
 * 편집모드 진입 시 기본 접힘 → 헤더에 활성 개수 배지 표시.
 */
function MonthScheduleFilters({
  staffList,
  staffFilter,
  setStaffFilter,
  employmentFilter,
  setEmploymentFilter,
  shiftFilter,
  setShiftFilter,
  editMode,
}: {
  staffList: MonthScheduleStaff[]
  staffFilter: Set<string>
  setStaffFilter: (s: Set<string>) => void
  employmentFilter: Set<string>
  setEmploymentFilter: (s: Set<string>) => void
  shiftFilter: Set<ShiftCode>
  setShiftFilter: (s: Set<ShiftCode>) => void
  editMode: boolean
}) {
  const hasAny =
    staffFilter.size > 0 || employmentFilter.size > 0 || shiftFilter.size > 0
  const activeCount =
    staffFilter.size + employmentFilter.size + shiftFilter.size

  // 편집모드: 기본 접힘. 편집모드 토글 시 재계산.
  const [open, setOpen] = useState(!editMode)
  useEffect(() => {
    setOpen(!editMode)
  }, [editMode])
  const showBody = !editMode || open

  function toggleStaff(id: string) {
    const next = new Set(staffFilter)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setStaffFilter(next)
  }
  function toggleEmpl(code: string) {
    const next = new Set(employmentFilter)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setEmploymentFilter(next)
  }
  function toggleShift(sh: ShiftCode) {
    const next = new Set(shiftFilter)
    if (next.has(sh)) next.delete(sh)
    else next.add(sh)
    setShiftFilter(next)
  }
  function reset() {
    setStaffFilter(new Set())
    setEmploymentFilter(new Set())
    setShiftFilter(new Set())
  }

  // 고용형태별로 직원 그룹화
  const grouped = new Map<string, MonthScheduleStaff[]>()
  for (const s of staffList) {
    const code = s.employmentCode ?? 'other'
    if (!grouped.has(code)) grouped.set(code, [])
    grouped.get(code)!.push(s)
  }
  const orderedCodes: string[] = []
  for (const o of EMPLOYMENT_GROUP_ORDER) {
    if (grouped.has(o.code)) orderedCodes.push(o.code)
  }
  for (const code of [...grouped.keys()].sort()) {
    if (!orderedCodes.includes(code)) orderedCodes.push(code)
  }
  function emplLabel(code: string): string {
    const std = EMPLOYMENT_GROUP_ORDER.find((o) => o.code === code)
    if (std) return std.label
    return grouped.get(code)?.[0]?.employmentLabel ?? code
  }

  const pillBase =
    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150'
  const pillOn = 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
  const pillOff =
    'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45 hover:ring-border/40'

  return (
    <div className="space-y-2.5 rounded-2xl bg-muted/20 p-3 shadow-sm ring-1 ring-border/25 dark:bg-muted/15">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {editMode ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-expanded={open}
              aria-label={open ? '필터 접기' : '필터 펼치기'}
            >
              <svg
                className={cn(
                  'size-3.5 shrink-0 transition-transform duration-150',
                  open ? 'rotate-180' : 'rotate-0',
                )}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
              <span>필터</span>
              {hasAny ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                  {activeCount}
                </span>
              ) : null}
            </button>
          ) : (
            <span className="text-xs font-medium">필터</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {hasAny ? '선택된 항목만 표시' : '전체 표시'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={reset}
            disabled={!hasAny}
          >
            필터 초기화
          </Button>
        </div>
      </div>

      {showBody ? (
      <>
      {/* 직원 */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="min-w-[52px] text-[11px] font-semibold text-muted-foreground">
          직원
        </span>
        {staffList.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">없음</span>
        ) : (
          staffList.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleStaff(s.id)}
              className={cn(pillBase, staffFilter.has(s.id) ? pillOn : pillOff)}
            >
              {s.name}
            </button>
          ))
        )}
      </div>

      {/* 고용형태 */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="min-w-[52px] text-[11px] font-semibold text-muted-foreground">
          고용형태
        </span>
        {orderedCodes.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">없음</span>
        ) : (
          orderedCodes.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggleEmpl(code)}
              className={cn(
                pillBase,
                employmentFilter.has(code) ? pillOn : pillOff,
              )}
            >
              {emplLabel(code)}
            </button>
          ))
        )}
      </div>

      {/* 시프트 */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="min-w-[52px] text-[11px] font-semibold text-muted-foreground">
          시프트
        </span>
        {(['open', 'middle', 'close'] as const).map((sh) => (
          <button
            key={sh}
            type="button"
            onClick={() => toggleShift(sh)}
            className={cn(pillBase, shiftFilter.has(sh) ? pillOn : pillOff)}
          >
            {SHIFT_LABEL[sh]}
          </button>
        ))}
      </div>
      </>
      ) : null}
    </div>
  )
}

/**
 * 월간 근무표 — 월급제 직원의 휴무 현황 표.
 * `omitOffDateList`: true면 «휴무일» 날짜 열 생략(좁은 3열 레이아웃용).
 */
function MonthOffDaysSummary({
  ym,
  dim,
  staffList,
  draft,
  omitOffDateList = false,
}: {
  ym: string
  dim: number
  staffList: MonthScheduleStaff[]
  draft: Record<string, MonthDraftCell>
  omitOffDateList?: boolean
}) {
  const salaryStaff = staffList.filter((s) => s.pay_mode === 'salary')
  if (salaryStaff.length === 0) return null

  return (
    <div className="rounded-2xl bg-muted/25 p-4 shadow-sm ring-1 ring-border/25 dark:bg-muted/15">
      <p className="mb-3 text-xs font-semibold tracking-tight">
        월 휴무 현황{' '}
        <span className="text-muted-foreground font-normal">
          (월급제 직원만 · 배정하지 않은 일자)
        </span>
      </p>
      <div className="overflow-x-auto">
        <table
          className={cn(
            'w-full border-collapse text-xs',
            omitOffDateList ? 'min-w-0' : 'min-w-[480px]',
          )}
        >
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground">
              <th className="py-1.5 pr-2 text-left font-medium">이름</th>
              <th className="py-1.5 pr-2 text-right font-medium">휴무일 의무</th>
              <th className={cn('py-1.5 text-right font-medium', !omitOffDateList && 'pr-3')}>
                사용 휴무일수
              </th>
              {!omitOffDateList ? (
                <th className="py-1.5 text-left font-medium">휴무일</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {salaryStaff.map((s) => {
              const required = s.requiredOffDays ?? 8
              const offDates: number[] = []
              for (let d = 1; d <= dim; d++) {
                const key = `${s.id}|${ym}-${String(d).padStart(2, '0')}`
                if (!draft[key]) offDates.push(d)
              }
              const offDays = offDates.length
              const diff = offDays - required
              let usedClass = 'text-emerald-700 dark:text-emerald-300'
              let usedSuffix = ''
              if (diff < 0) {
                usedClass = 'text-destructive'
                usedSuffix = ` (⚠ ${-diff}일 부족)`
              } else if (diff > 0) {
                usedClass = 'text-destructive'
                usedSuffix = ` (🔺 ${diff}일 초과)`
              }
              return (
                <tr key={s.id} className="border-b border-border/30 last:border-b-0">
                  <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                    {required}일
                  </td>
                  <td className={cn('py-1.5 text-right tabular-nums font-medium', !omitOffDateList && 'pr-3', usedClass)}>
                    {offDays}일{usedSuffix}
                  </td>
                  {!omitOffDateList ? (
                    <td className="py-1.5 text-[11px] text-muted-foreground tabular-nums">
                      {offDates.length > 0 ? offDates.join(', ') : '—'}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 읽기 전용 — 하루 단위 근무 막대(출퇴근 화면과 유사한 시간축) */
type MonthDayTimelineRow = {
  staff: MonthScheduleStaff
  shift: ShiftCode
  startHm: string
  endHm: string
}

/** 일별 타임라인 막대 — 직선에 가깝게(겹침·경계 가독성), 시프트별 왼쪽 강조선 */
function timelineBarAccent(shift: ShiftCode): string {
  if (shift === 'open') return 'border-l-[3px] border-l-primary'
  if (shift === 'middle') return 'border-l-[3px] border-l-blue-600 dark:border-l-blue-400'
  if (shift === 'close') return 'border-l-[3px] border-l-amber-600 dark:border-l-amber-400'
  return 'border-l-[3px] border-l-muted-foreground'
}

function MonthDayShiftTimeline({
  workDate,
  rows,
  onClose,
  embedded = false,
}: {
  workDate: string
  rows: MonthDayTimelineRow[]
  onClose: () => void
  /** 달력 격자 `col-span-7` 안에 끼워 넣을 때 — 바깥 여밉·모서리 생략 */
  embedded?: boolean
}) {
  const { startMin, endMin, hourSlotStarts } = useMemo(() => {
    let minS = 9 * 60
    let maxE = 21 * 60
    for (const r of rows) {
      let a = shiftHmToMinutes(r.startHm) ?? minS
      let b = shiftHmToMinutes(r.endHm) ?? maxE
      if (b <= a) b += 24 * 60
      minS = Math.min(minS, a)
      maxE = Math.max(maxE, b)
    }
    minS = Math.max(0, Math.floor(minS / 60) * 60 - 60)
    maxE = Math.min(24 * 60, Math.ceil(maxE / 60) * 60 + 60)
    if (maxE <= minS) maxE = minS + 12 * 60
    /** 1시간 = 1열. 각 값은 그 열의 왼쪽(정각) 시각(분). 마지막 열은 [endMin-60, endMin). */
    const rangeMin = maxE - minS
    const slotCount = Math.max(1, Math.round(rangeMin / 60))
    const slotStarts = Array.from({ length: slotCount }, (_, i) => minS + i * 60)
    return { startMin: minS, endMin: maxE, hourSlotStarts: slotStarts }
  }, [rows])

  const range = Math.max(1, endMin - startMin)
  const dow = new Date(`${workDate}T12:00:00`).getDay()
  const titleDow = DOW_KO[dow]
  const [, mm, dd] = workDate.split('-')
  /** 타임라인 격자 안 — 바깥 `bg-background`보다 살짝만 옅은 흰색 */
  const timelineInnerBg = 'bg-neutral-50 dark:bg-muted/25'

  return (
    <div
      className={cn(
        embedded
          ? 'rounded-b-xl bg-background'
          : 'mt-4 rounded-2xl border border-border/45 bg-background shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/35 bg-muted/10 px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="min-w-0 pr-2">
          <p className="text-base font-semibold tracking-tight">
            {parseInt(mm!, 10)}월 {parseInt(dd!, 10)}일 ({titleDow}) 근무 타임라인
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            읽기 전용 · 같은 날짜를 다시 누르면 접습니다. 편집은 «수정»에서 하세요.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={onClose}>
          닫기
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
          이 날짜에 표시할 근무 배정이 없습니다. (필터를 쓰는 경우 선택에 맞게 줄어듭니다.)
        </p>
      ) : (
        <div className="overflow-x-auto bg-background px-3 pb-6 pt-3 sm:px-5 sm:pb-7 sm:pt-4">
          <div
            className={cn(
              'min-w-[520px] overflow-hidden rounded-xl pb-3 shadow-sm ring-1 ring-border/20 sm:pb-4',
              timelineInnerBg,
            )}
          >
            <div className="flex">
              <div className={cn('w-24 shrink-0', timelineInnerBg)} aria-hidden />
              <div
                className={cn(
                  'grid flex-1 border-b-2 border-r border-border/40',
                  timelineInnerBg,
                )}
                style={{
                  gridTemplateColumns: `repeat(${hourSlotStarts.length}, minmax(2rem, 1fr))`,
                }}
              >
                {hourSlotStarts.map((t, i) => (
                  <div
                    key={t}
                    className={cn(
                      'border-l border-border/45 py-2.5 text-center text-[11px] font-semibold tabular-nums text-foreground/85 sm:py-3',
                      i === 0 && 'border-l-0',
                    )}
                  >
                    {Math.floor(t / 60)}시
                  </div>
                ))}
              </div>
            </div>

            {rows.map((row) => {
              let a = shiftHmToMinutes(row.startHm) ?? startMin
              let b = shiftHmToMinutes(row.endHm) ?? endMin
              if (b <= a) b += 24 * 60
              const left = ((a - startMin) / range) * 100
              const width = Math.max(((b - a) / range) * 100, 2.5)
              return (
                <div
                  key={row.staff.id}
                  className={cn(
                    'flex items-stretch last:[&>div]:border-b-0',
                    timelineInnerBg,
                  )}
                >
                  <div
                    className={cn(
                      'flex w-24 shrink-0 flex-col items-center justify-center border-b border-r border-border/45 px-2 py-3 text-center text-xs font-semibold leading-snug text-foreground sm:py-3.5',
                      timelineInnerBg,
                    )}
                  >
                    <span className="line-clamp-2 w-full text-center">{row.staff.name}</span>
                  </div>
                  <div
                    className={cn(
                      'relative min-h-[3.25rem] flex-1 border-b border-r border-border/45 sm:min-h-14',
                      timelineInnerBg,
                    )}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 grid"
                      style={{
                        gridTemplateColumns: `repeat(${hourSlotStarts.length}, 1fr)`,
                      }}
                    >
                      {hourSlotStarts.map((t, i) => (
                        <div
                          key={t}
                          className={cn(
                            'border-l border-border/40 bg-transparent',
                            i === 0 && 'border-l-0',
                          )}
                        />
                      ))}
                    </div>
                    <div
                      className="absolute inset-y-2 z-[1] min-w-[2.25rem] sm:inset-y-2.5"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <div
                        className={cn(
                          'flex h-full min-h-8 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-muted px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground shadow-sm sm:min-h-9 sm:px-3 sm:text-xs',
                          timelineBarAccent(row.shift),
                        )}
                        title={`${SHIFT_LABEL[row.shift]} ${row.startHm}–${row.endHm}`}
                      >
                        <span className="truncate text-foreground">
                          {SHIFT_LABEL[row.shift]}
                        </span>
                        <span className="shrink-0 text-foreground/95">
                          {row.startHm}–{row.endHm}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

type MonthScheduleGridProps = {
  ym: string
  onYmChange: (v: string) => void
  staffList: MonthScheduleStaff[]
  cells: import('@/hooks/useMonthSchedule').MonthCellRow[]
  draft: Record<string, MonthDraftCell>
  loading: boolean
  saving: boolean
  /** 셀 클릭 시 draft 반영(편집 모드). 읽기 모드 날짜 클릭은 그리드 내부에서 타임라인만 토글 */
  onCellApply: (staffId: string, workDate: string, value: MonthDraftCell) => void
  onApplyDefaults: () => void
  /** 저장 결과 — true=성공(편집모드 종료), false=실패 또는 변경없음 */
  onSave: () => Promise<boolean> | boolean
  /** 「취소」 시 draft를 DB cells 기반으로 복원 */
  onResetDraft: () => void
  defaultsBusy: boolean
  /** tooltip 상세 시간 표시용 */
  store?: import('@/lib/shiftResolver').StoreShiftColumns | null
}

type ShiftMode = 'open' | 'middle' | 'close' | 'manual' | 'off'

function MonthScheduleGrid({
  ym,
  onYmChange,
  staffList,
  draft,
  loading,
  saving,
  onCellApply,
  onApplyDefaults,
  onSave,
  onResetDraft,
  defaultsBusy,
  store = null,
}: MonthScheduleGridProps) {
  const [pickedStaffId, setPickedStaffId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [shiftMode, setShiftMode] = useState<ShiftMode | null>(null)
  const [manualShift, setManualShift] = useState<ShiftCode>('open')
  const [manualStart, setManualStart] = useState('09:00')
  const [manualEnd, setManualEnd] = useState('14:00')
  /** 필터 — Set이 비어있으면 전체 표시. 하나라도 선택되면 그것만. */
  const [staffFilter, setStaffFilter] = useState<Set<string>>(new Set())
  const [employmentFilter, setEmploymentFilter] = useState<Set<string>>(new Set())
  const [shiftFilter, setShiftFilter] = useState<Set<ShiftCode>>(new Set())
  /** 칩 마우스오버 — portal로 fixed tooltip (HTML title 대신) */
  const [chipHover, setChipHover] = useState<{
    clientX: number
    clientY: number
    label: string
  } | null>(null)
  /** 읽기 모드에서 날짜 클릭 시 하단 타임라인에 표시할 yyyy-mm-dd */
  const [viewTimelineDate, setViewTimelineDate] = useState<string | null>(null)

  useEffect(() => {
    if (editMode) setViewTimelineDate(null)
  }, [editMode])

  useEffect(() => {
    setViewTimelineDate(null)
  }, [ym])

  async function handleSaveClick() {
    const success = await onSave()
    if (success) setEditMode(false)
  }

  function handleCancel() {
    if (!window.confirm('수정사항이 초기화됩니다. 취소하시겠습니까?')) return
    onResetDraft()
    setEditMode(false)
  }

  function handleApplyDefaultsClick() {
    if (!editMode) {
      window.alert('먼저 «수정»을 눌러 편집 모드로 진입해 주세요.')
      return
    }
    onApplyDefaults()
  }

  function buildNextValue(): MonthDraftCell {
    if (shiftMode === null) return null
    if (shiftMode === 'off') return null
    if (shiftMode === 'manual') {
      if (!manualStart || !manualEnd) return null
      if (manualEnd <= manualStart) return null
      return { shift: manualShift, start_time: manualStart, end_time: manualEnd }
    }
    return { shift: shiftMode, start_time: null, end_time: null }
  }

  const [y, m] = ym.split('-').map(Number)
  const dim = y && m ? daysInMonth(y, m) : 30
  const todayYmd = formatYmdLocal(new Date())

  const effStore = useMemo(
    () =>
      store ?? {
        shift_open_start: null,
        shift_open_end: null,
        shift_middle_start: null,
        shift_middle_end: null,
        shift_close_start: null,
        shift_close_end: null,
      },
    [store],
  )

  function navMonth(delta: number) {
    const d = new Date(y, m - 1 + delta, 1)
    const ny = d.getFullYear()
    const nm = d.getMonth() + 1
    onYmChange(`${ny}-${String(nm).padStart(2, '0')}`)
  }

  // 달력 칸 배열 (null = 빈 칸, string = yyyy-mm-dd)
  const firstDow = new Date(y, m - 1, 1).getDay()
  const calDates: (string | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= dim; d++) {
    calDates.push(`${ym}-${String(d).padStart(2, '0')}`)
  }
  while (calDates.length % 7 !== 0) calDates.push(null)

  const calWeeks: (string | null)[][] = []
  for (let i = 0; i < calDates.length; i += 7) {
    calWeeks.push(calDates.slice(i, i + 7))
  }

  function passesFilters(staff: MonthScheduleStaff, cell: MonthDraftCell): boolean {
    if (!cell) return false
    if (staffFilter.size > 0 && !staffFilter.has(staff.id)) return false
    if (employmentFilter.size > 0) {
      const code = staff.employmentCode ?? 'other'
      if (!employmentFilter.has(code)) return false
    }
    if (shiftFilter.size > 0 && !shiftFilter.has(cell.shift)) return false
    return true
  }

  function assignedOn(date: string) {
    const filtered = staffList.filter((s) => {
      const v = draft[`${s.id}|${date}`]
      if (v === null || v === undefined) return false
      return passesFilters(s, v)
    })
    if (!store) return filtered
    // 근무 시작 시간 이른 순으로 정렬 (cell 예외 > 매장 기본)
    return filtered.slice().sort((a, b) => {
      const ca = draft[`${a.id}|${date}`]!
      const cb = draft[`${b.id}|${date}`]!
      const startA = getShiftTimeForDay(
        ca.shift,
        { start_time: ca.start_time, end_time: ca.end_time },
        store,
      ).startTime
      const startB = getShiftTimeForDay(
        cb.shift,
        { start_time: cb.start_time, end_time: cb.end_time },
        store,
      ).startTime
      if (startA !== startB) return startA.localeCompare(startB)
      // 같은 시작 시간이면 이름순(안정 정렬 보조)
      return a.name.localeCompare(b.name, 'ko')
    })
  }

  /** 휴무 표용 — 시프트 필터 제외하고 직원·고용형태 필터만 적용한 staffList */
  const filteredStaffForSummary = useMemo(
    () =>
      staffList.filter((s) => {
        if (staffFilter.size > 0 && !staffFilter.has(s.id)) return false
        if (employmentFilter.size > 0) {
          const code = s.employmentCode ?? 'other'
          if (!employmentFilter.has(code)) return false
        }
        return true
      }),
    [staffList, staffFilter, employmentFilter],
  )

  const timelineRows: MonthDayTimelineRow[] = useMemo(() => {
    if (!viewTimelineDate) return []
    const filtered = staffList.filter((s) => {
      const v = draft[`${s.id}|${viewTimelineDate}`]
      if (v == null || v === undefined) return false
      return passesFilters(s, v)
    })
    let list = filtered
    if (store) {
      list = filtered.slice().sort((a, b) => {
        const ca = draft[`${a.id}|${viewTimelineDate}`]!
        const cb = draft[`${b.id}|${viewTimelineDate}`]!
        const startA = getShiftTimeForDay(
          ca.shift,
          { start_time: ca.start_time, end_time: ca.end_time },
          effStore,
        ).startTime
        const startB = getShiftTimeForDay(
          cb.shift,
          { start_time: cb.start_time, end_time: cb.end_time },
          effStore,
        ).startTime
        if (startA !== startB) return startA.localeCompare(startB)
        return a.name.localeCompare(b.name, 'ko')
      })
    } else {
      list = filtered.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    }
    return list.map((s) => {
      const cell = draft[`${s.id}|${viewTimelineDate}`]!
      const t = getShiftTimeForDay(cell.shift, cell, effStore)
      return {
        staff: s,
        shift: cell.shift,
        startHm: t.startTime,
        endHm: t.endTime,
      }
    })
  }, [
    viewTimelineDate,
    staffList,
    draft,
    staffFilter,
    employmentFilter,
    shiftFilter,
    store,
    effStore,
  ])

  function handleReadModeDayClick(date: string) {
    setViewTimelineDate((prev) => (prev === date ? null : date))
  }

  function handleEditModeCellClick(date: string) {
    if (date < todayYmd) {
      window.alert('지난 날짜는 수정할 수 없습니다.')
      return
    }
    if (!pickedStaffId) {
      window.alert('상단에서 근무자를 먼저 선택해 주세요.')
      return
    }
    if (shiftMode === null) {
      window.alert('시프트 모드를 먼저 선택해 주세요.')
      return
    }
    const next = buildNextValue()
    if (shiftMode === 'manual' && next === null) {
      window.alert('수동 시각이 올바르지 않습니다 (시작 < 종료, HH:MM).')
      return
    }
    onCellApply(pickedStaffId, date, next)
  }

  function handleCalendarDayClick(date: string) {
    if (!editMode) {
      handleReadModeDayClick(date)
      return
    }
    handleEditModeCellClick(date)
  }

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
        <CardTitle className="text-lg font-semibold tracking-tight">월간 근무표</CardTitle>
        <CardDescription className="max-w-3xl text-sm leading-relaxed">
          {editMode
            ? '편집 모드 — 근무자와 시프트 모드를 고른 뒤 달력 칸을 누르면 배정이 적용됩니다. «휴무(삭제)» 모드일 때만 해당 날짜 배정이 지워집니다. «저장»으로 DB에 반영됩니다.'
            : '읽기 모드 — 날짜를 누르면 그날 근무 타임라인이 아래에 열립니다. 수정은 «수정»을 누르세요.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {/* 컨트롤 — 모바일: 월 네비 → 좌/우 액션 / md+: 좌·가운데·우 한 줄 */}
        <div className="grid max-w-full grid-cols-1 gap-2 rounded-2xl bg-muted/35 px-3 py-2.5 shadow-sm ring-1 ring-border/20 dark:bg-muted/20 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-x-3">
          <div className="order-2 flex min-w-0 flex-wrap items-center gap-2 md:order-none md:justify-self-start">
            {editMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={defaultsBusy}
                onClick={handleApplyDefaultsClick}
              >
                {defaultsBusy ? '적용 중…' : '📅 기본 근무 세팅'}
              </Button>
            ) : null}
          </div>
          <div className="order-1 flex w-full min-w-0 justify-center md:order-none md:w-auto md:justify-self-center">
            <div className="inline-flex max-w-full flex-nowrap items-center gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 shrink-0 rounded-full px-0"
                onClick={() => navMonth(-1)}
              >
                ◀
              </Button>
              <div className="relative isolate h-9 w-[11.5rem] max-w-full shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
                <div
                  className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center px-7 text-center text-sm font-semibold tabular-nums leading-none text-foreground"
                  aria-hidden
                >
                  <span className="min-w-0 whitespace-nowrap">
                    {y && m ? `${y}년 ${m}월` : ym}
                  </span>
                </div>
                <span
                  className="pointer-events-none absolute right-2 top-1/2 z-0 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                >
                  <svg
                    className="size-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </span>
                {/* 네이티브 input만 겹침 — Base UI Input은 Field 레이아웃과 겹치며 라벨이 잘릴 수 있음 */}
                <input
                  type="month"
                  className="absolute inset-0 z-10 m-0 h-full w-full min-w-0 cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  value={ym}
                  onChange={(e) => onYmChange(e.target.value)}
                  aria-label={y && m ? `${y}년 ${m}월, 표시할 연·월 변경` : '표시할 연·월 선택'}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 shrink-0 rounded-full px-0"
                onClick={() => navMonth(1)}
              >
                ▶
              </Button>
            </div>
          </div>
          <div className="order-3 flex flex-wrap items-center justify-end gap-2 md:order-none md:justify-self-end">
            {editMode ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={handleCancel}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleSaveClick()}
                >
                  {saving ? '저장 중…' : '저장'}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setPickedStaffId(null)
                  setShiftMode(null)
                  setEditMode(true)
                }}
              >
                수정
              </Button>
            )}
          </div>
        </div>

        {/* 필터 — 직원/고용형태/시프트 다중 토글 */}
        {staffList.length > 0 ? (
          <MonthScheduleFilters
            staffList={staffList}
            staffFilter={staffFilter}
            setStaffFilter={setStaffFilter}
            employmentFilter={employmentFilter}
            setEmploymentFilter={setEmploymentFilter}
            shiftFilter={shiftFilter}
            setShiftFilter={setShiftFilter}
            editMode={editMode}
          />
        ) : null}

        {/* 근무자 선택 · 시프트 모드 · 월 휴무 현황 — 편집 모드 3열 */}
        {editMode && staffList.length > 0 ? (
          <div className="grid min-w-0 gap-3 md:grid-cols-3">
            <div className="min-w-0">
              <StaffPickerByEmployment
                staffList={staffList}
                pickedStaffId={pickedStaffId}
                onPick={(id) => setPickedStaffId(id)}
              />
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/25 p-3 shadow-sm ring-1 ring-border/25 dark:bg-muted/15">
              <div className="mb-2 space-y-0.5 px-0.5">
                <span className="text-xs font-semibold tracking-tight">시프트 모드</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  셀 클릭 시 적용할 시프트·시각 또는 휴무 처리
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(['open', 'middle', 'close', 'manual'] as const).map((m) => {
                  const label = m === 'manual' ? '수동' : SHIFT_LABEL[m]
                  const isActive = shiftMode === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setShiftMode(m)}
                      className={cn(
                        'min-w-[58px] flex-1 rounded-full px-2 py-1.5 text-center text-xs font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                          : 'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45 hover:ring-border/45',
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
                <button
                  key="off"
                  type="button"
                  onClick={() => setShiftMode('off')}
                  className={cn(
                    'min-w-[64px] flex-1 rounded-full px-2 py-1.5 text-center text-xs font-medium transition-all duration-150',
                    shiftMode === 'off'
                      ? 'bg-destructive/15 text-destructive shadow-sm ring-2 ring-destructive/35'
                      : 'bg-background/80 text-destructive/90 shadow-sm ring-1 ring-border/30 hover:bg-muted/45',
                  )}
                >
                  휴무
                </button>
              </div>
              {shiftMode === 'manual' ? (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <select
                    className="border-input bg-background h-8 w-full rounded-xl border border-border/50 px-2 text-xs shadow-sm sm:w-auto"
                    value={manualShift}
                    onChange={(e) =>
                      setManualShift(e.target.value as ShiftCode)
                    }
                  >
                    {(['open', 'middle', 'close'] as const).map((s) => (
                      <option key={s} value={s}>
                        {SHIFT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      type="time"
                      className="h-9 min-w-0 flex-1 text-sm tabular-nums sm:w-[130px] sm:flex-none"
                      value={manualStart}
                      onChange={(e) => setManualStart(e.target.value)}
                    />
                    <span className="text-muted-foreground text-xs">~</span>
                    <Input
                      type="time"
                      className="h-9 min-w-0 flex-1 text-sm tabular-nums sm:w-[130px] sm:flex-none"
                      value={manualEnd}
                      onChange={(e) => setManualEnd(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="min-w-0 md:min-w-[180px]">
              <MonthOffDaysSummary
                ym={ym}
                dim={dim}
                staffList={filteredStaffForSummary}
                draft={draft}
                omitOffDateList
              />
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="text-muted-foreground text-sm">불러오는 중…</p>
        ) : staffList.length === 0 ? (
          <p className="text-muted-foreground text-sm">등록된 직원이 없습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
              <div className="overflow-hidden rounded-xl border border-border/45 bg-border/30 shadow-sm ring-1 ring-black/[0.03] dark:bg-border/25 dark:ring-white/[0.06]">
              {/* 요일 헤더 — 한 줄 테이블 느낌 */}
              <div className="grid grid-cols-7 border-b border-border/50 bg-muted/50">
                {DOW_CAL.map((d, i) => (
                  <div
                    key={d}
                    className={cn(
                      'border-r border-border/35 py-2.5 text-center text-xs font-semibold text-foreground/90 last:border-r-0',
                      i === 0 && 'text-destructive',
                      i === 6 && 'text-blue-600 dark:text-blue-400',
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 달력 격자 — 주 단위로 쪼개 선택일 타임라인을 해당 주·다음 주 사이(col-span-7)에 삽입 */}
              <div className="grid grid-cols-7 gap-px bg-border/35">
                {calWeeks.flatMap((week, wi) => {
                  const rowCells = week.map((date, dowIdx) => {
                    const globalIdx = wi * 7 + dowIdx
                    const pickedCell =
                      date && pickedStaffId
                        ? draft[`${pickedStaffId}|${date}`] ?? null
                        : null
                    const isPast = Boolean(date && date < todayYmd)
                    const isEditClickable = Boolean(
                      date && pickedStaffId && shiftMode !== null && editMode && !isPast,
                    )
                    const isReadPickable = Boolean(!editMode && date)
                    return (
                      <div
                        key={date ?? `blank-${globalIdx}`}
                        onClick={() => date && handleCalendarDayClick(date)}
                        className={cn(
                          'min-h-[118px] bg-card p-3 transition-colors',
                          !date && 'min-h-[118px] bg-muted/20',
                          date === todayYmd &&
                            'bg-primary/[0.05] ring-1 ring-inset ring-primary/30',
                          isPast &&
                            editMode &&
                            'cursor-not-allowed border border-dashed border-muted-foreground/25 bg-muted/15 opacity-[0.88]',
                          isReadPickable && 'cursor-pointer hover:bg-muted/35',
                          isReadPickable &&
                            date === viewTimelineDate &&
                            'bg-primary/[0.07] ring-2 ring-inset ring-primary/35',
                          isEditClickable && 'cursor-pointer hover:bg-muted/30',
                          isEditClickable && pickedCell && 'ring-1 ring-inset ring-primary/25',
                        )}
                      >
                        {date ? (
                          <>
                            <div
                              className={cn(
                                'mb-2 text-base font-semibold tabular-nums leading-none',
                                dowIdx === 0 && 'text-destructive',
                                dowIdx === 6 && 'text-blue-600 dark:text-blue-400',
                                date === todayYmd && 'text-primary',
                              )}
                            >
                              {parseInt(date.split('-')[2]!, 10)}
                            </div>

                            <div className="space-y-1.5">
                              {assignedOn(date).map((s) => {
                                const cell = draft[`${s.id}|${date}`]!
                                const shift = cell.shift
                                const isSalary = s.pay_mode === 'salary'
                                let timeRange = ''
                                if (cell.start_time && cell.end_time) {
                                  timeRange = `${cell.start_time}~${cell.end_time}`
                                } else {
                                  const t = getShiftTimeForDay(shift, null, effStore)
                                  timeRange = `${t.startTime}~${t.endTime}`
                                }
                                const exceptionSuffix =
                                  cell.start_time && cell.end_time ? ' (당일 예외)' : ''
                                const tooltipLabel = `[${SHIFT_LABEL[shift]}] ${s.name}${timeRange ? ' ' + timeRange : ''}${exceptionSuffix}`
                                const onEnter = (e: ReactMouseEvent) =>
                                  setChipHover({
                                    clientX: e.clientX,
                                    clientY: e.clientY,
                                    label: tooltipLabel,
                                  })
                                const onMove = (e: ReactMouseEvent) =>
                                  setChipHover((prev) =>
                                    prev
                                      ? { ...prev, clientX: e.clientX, clientY: e.clientY }
                                      : prev,
                                  )
                                const onLeave = () => setChipHover(null)
                                return (
                                  <div
                                    key={s.id}
                                    onMouseEnter={onEnter}
                                    onMouseMove={onMove}
                                    onMouseLeave={onLeave}
                                    className={cn(
                                      'flex w-full items-center gap-1.5 truncate rounded-lg px-1.5 py-1',
                                      'text-left text-xs leading-snug',
                                      isSalary
                                        ? monthShiftClass(shift)
                                        : monthShiftTextOnlyClass(shift),
                                    )}
                                  >
                                    {isSalary ? (
                                      <>
                                        <span className="min-w-0 flex-1 truncate font-medium">
                                          {s.name}
                                        </span>
                                        <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold">
                                          {SHIFT_LABEL[shift]}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        {/* 이름 우선 — shrink-0으로 절대 짤리지 않음. 시간은 공간 부족 시 ellipsis. */}
                                        <span className="shrink-0 font-medium">
                                          {s.name}
                                        </span>
                                        {timeRange ? (
                                          <span className="ml-auto min-w-0 shrink truncate text-[11px] font-medium tabular-nums text-foreground/90">
                                            {timeRange}
                                          </span>
                                        ) : null}
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )
                  })
                  const showWeekTimeline = Boolean(
                    viewTimelineDate &&
                      !editMode &&
                      week.some((d) => d === viewTimelineDate),
                  )
                  return [
                    ...rowCells,
                    <div
                      key={`week-timeline-slot-${wi}`}
                      className={cn(
                        'col-span-7 grid overflow-hidden',
                        'transition-[grid-template-rows] duration-300 ease-out',
                        'motion-reduce:transition-none motion-reduce:duration-0',
                        showWeekTimeline ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        {showWeekTimeline ? (
                          <div
                            className={cn(
                              'rounded-b-xl border-t border-border/40 bg-muted/15 px-1 pb-2 pt-0.5 sm:px-1.5 sm:pb-3',
                              'animate-in fade-in slide-in-from-top-2 duration-300',
                              'motion-reduce:animate-none',
                            )}
                          >
                            <MonthDayShiftTimeline
                              embedded
                              workDate={viewTimelineDate!}
                              rows={timelineRows}
                              onClose={() => setViewTimelineDate(null)}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>,
                  ]
                })}
              </div>
              </div>
            </div>
          </div>
          </>
        )}
      </CardContent>
      {chipHover
        ? createPortal(
            <div
              className="border-border bg-popover text-popover-foreground pointer-events-none fixed z-[10000] max-w-[260px] whitespace-pre-line rounded-xl border px-3 py-2 text-xs shadow-lg"
              style={{
                left: chipHover.clientX + 12,
                top: chipHover.clientY + 12,
              }}
            >
              {chipHover.label}
            </div>,
            document.body,
          )
        : null}
    </Card>
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
  const todayYmd = formatYmdLocal(new Date())
  const isPast = dateKey < todayYmd

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

        {/* 조작 — 상태 기반 강조: 미출근 → 「출근」 primary, 출근완료 → 「퇴근」 primary, 종료 → 「수정」만 */}
        <td className={cell}>
          <div className="flex flex-wrap justify-end gap-1">
            {showPunch ? (
              <>
                <Button
                  size="sm"
                  type="button"
                  variant={hasActualPunchIn ? 'ghost' : 'default'}
                  className={cn(
                    'h-7 px-2.5 text-xs',
                    !hasActualPunchIn && 'shadow-md shadow-primary/15',
                  )}
                  disabled={punchIn.isPending || hasActualPunchIn}
                  onClick={() => void handlePunchIn()}
                >
                  출근
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={
                    hasActualPunchIn && !hasActualPunchOut ? 'default' : 'secondary'
                  }
                  className={cn(
                    'h-7 px-2.5 text-xs',
                    hasActualPunchIn && !hasActualPunchOut && 'shadow-md shadow-primary/15',
                  )}
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
              className="h-7 px-2.5 text-xs"
              disabled={!editableId || editMode || isPast}
              title={isPast ? '지난 날짜는 수정할 수 없습니다.' : undefined}
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
                disabled={correctAttendance.isPending || deleteAttendance.isPending || isPast}
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
                disabled={correctAttendance.isPending || deleteAttendance.isPending || !editableId || isPast}
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

/** 오늘 상태 요약 배지 row — 한눈 카운터 */
function AttendanceSummaryBadges({
  counts,
}: {
  counts: { working: number; done: number; pending: number; off: number; late: number }
}) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ring-1'
  const cells: { label: string; n: number; cls: string }[] = [
    {
      label: '출근중',
      n: counts.working,
      cls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
    },
    {
      label: '근무종료',
      n: counts.done,
      cls: 'bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25',
    },
    {
      label: '미출근',
      n: counts.pending,
      cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/30',
    },
    {
      label: '휴무',
      n: counts.off,
      cls: 'bg-muted text-muted-foreground ring-border/40',
    },
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cells.map((c) => (
        <span key={c.label} className={cn(base, c.cls)}>
          {c.label}
          <span className="font-semibold tabular-nums">{c.n}</span>
        </span>
      ))}
      {counts.late > 0 ? (
        <span className={cn(base, 'bg-destructive/12 text-destructive ring-destructive/30')}>
          지각<span className="font-semibold tabular-nums">{counts.late}</span>
        </span>
      ) : null}
    </div>
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
  const nowHmLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="mb-3 overflow-hidden rounded-xl bg-background shadow-sm ring-1 ring-border/30">
      <div className="flex">
        {/* 이름 열 — 폭 확대, 시프트 컬러 닷 표시 */}
        <div className="w-[104px] shrink-0 border-r border-border/45">
          <div className="h-8 border-b border-border/45 bg-muted/40" />
          {scheduled.map((s) => {
            const planned = plannedMap.get(`${s.id}_${todayKey}`)!
            return (
              <div
                key={s.id}
                className="flex h-10 items-center gap-1.5 border-b border-border/25 px-2 last:border-b-0"
              >
                <span className="truncate text-xs font-medium">{s.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {planned.bandLabel}
                </span>
              </div>
            )
          })}
        </div>

        {/* 타임라인 */}
        <div className="relative min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-[320px]">
            {/* 시간 헤더 */}
            <div className="flex h-8 border-b border-border/45 bg-muted/40">
              {Array.from({ length: hourCount }, (_, i) => (
                <div key={i} className="flex-1 border-l border-border/45 px-1 first:border-l-0">
                  <span className="text-[10px] font-medium leading-8 text-muted-foreground tabular-nums">
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
                  className="relative h-10 border-b border-border/25 last:border-b-0"
                >
                  {/* 격자 선 — 진하게 */}
                  {Array.from({ length: hourCount - 1 }, (_, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute inset-y-0 w-px bg-border/45"
                      style={{ left: `${pct((minHour + i + 1) * 60)}%` }}
                    />
                  ))}

                  {/* 예정 바 — 상단 절반, 회색 아웃라인 */}
                  {pLeft != null && pWidth != null && pWidth > 0 && (
                    <div
                      className="absolute top-[5px] h-[14px] rounded bg-muted-foreground/10 ring-1 ring-inset ring-muted-foreground/35"
                      style={{ left: `${pLeft}%`, width: `${pWidth}%` }}
                    />
                  )}

                  {/* 실제 바 — 하단 절반, 초록 솔리드 */}
                  {aLeft != null && (
                    <div
                      className="absolute bottom-[5px] h-[14px] rounded bg-primary/80 shadow-sm shadow-primary/15"
                      style={{
                        left: `${aLeft}%`,
                        width: aWidth != null && aWidth > 0 ? `${aWidth}%` : '4px',
                      }}
                    />
                  )}
                </div>
              )
            })}

            {/* 현재 시각 선 — 두께 강화 + 상단 시각 레이블 */}
            {showNowLine && (
              <>
                <div
                  className="pointer-events-none absolute top-8 bottom-0 w-[2px] bg-rose-500"
                  style={{ left: `${pct(nowMin)}%` }}
                />
                <div
                  className="pointer-events-none absolute top-0 z-10 flex h-8 -translate-x-1/2 items-center"
                  style={{ left: `${pct(nowMin)}%` }}
                >
                  <span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm tabular-nums">
                    {nowHmLabel}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-4 border-t border-border/30 bg-muted/15 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-6 rounded bg-muted-foreground/10 ring-1 ring-inset ring-muted-foreground/35" />
          <span className="text-[10px] text-muted-foreground">예정</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-6 rounded bg-primary/80" />
          <span className="text-[10px] text-muted-foreground">실제</span>
        </div>
        {showNowLine && (
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-[2px] rounded-full bg-rose-500" />
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

  const groupedRange = useMemo(
    () => groupAttendanceByDateStaff(rangeRows ?? []),
    [rangeRows],
  )
  const groupedToday = useMemo(
    () => groupAttendanceByDateStaff(todayRows ?? []),
    [todayRows],
  )

  // v1.5.3: 출퇴근 「예정」 표시도 schedule_month_cells 기반으로 통일 (A안 완성)
  const { data: monthCellsForAttendance } = useMonthCellsDateRange(
    effFrom || undefined,
    effTo || undefined,
  )
  const plannedMap = useMemo(() => {
    return plannedFromMonthCells(
      monthCellsForAttendance ?? [],
      shiftStore?.store ?? null,
    )
  }, [monthCellsForAttendance, shiftStore?.store])

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

  /** 빠른 기간 프리셋 — chip row */
  type PresetKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'last30'
  function applyPreset(p: PresetKey) {
    const now = new Date()
    if (p === 'today') {
      const k = formatYmdLocal(now)
      setRangeFrom(k); setRangeTo(k); return
    }
    if (p === 'yesterday') {
      const y = formatYmdLocal(addDaysLocal(now, -1))
      setRangeFrom(y); setRangeTo(y); return
    }
    if (p === 'thisWeek') {
      setRangeFrom(thisWeekStart); setRangeTo(thisWeekEnd); return
    }
    if (p === 'lastWeek') {
      const lws = addDaysLocal(parseYmdLocal(thisWeekStart), -7)
      const lwe = addDaysLocal(lws, 6)
      setRangeFrom(formatYmdLocal(lws)); setRangeTo(formatYmdLocal(lwe)); return
    }
    if (p === 'thisMonth') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      setRangeFrom(formatYmdLocal(first)); setRangeTo(formatYmdLocal(last)); return
    }
    if (p === 'last30') {
      const start = addDaysLocal(now, -29)
      setRangeFrom(formatYmdLocal(start)); setRangeTo(formatYmdLocal(now)); return
    }
  }
  /** 현재 from~to가 어느 프리셋과 일치하는지 — 활성 표시용 */
  const activePreset: PresetKey | null = useMemo(() => {
    if (!effFrom || !effTo) return null
    const today = formatYmdLocal(new Date())
    if (effFrom === today && effTo === today) return 'today'
    const ymd = formatYmdLocal(addDaysLocal(new Date(), -1))
    if (effFrom === ymd && effTo === ymd) return 'yesterday'
    if (effFrom === thisWeekStart && effTo === thisWeekEnd) return 'thisWeek'
    const lws = formatYmdLocal(addDaysLocal(parseYmdLocal(thisWeekStart), -7))
    const lwe = formatYmdLocal(addDaysLocal(parseYmdLocal(lws), 6))
    if (effFrom === lws && effTo === lwe) return 'lastWeek'
    const now = new Date()
    const monthFirst = formatYmdLocal(new Date(now.getFullYear(), now.getMonth(), 1))
    const monthLast = formatYmdLocal(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    if (effFrom === monthFirst && effTo === monthLast) return 'thisMonth'
    const l30Start = formatYmdLocal(addDaysLocal(new Date(), -29))
    if (effFrom === l30Start && effTo === today) return 'last30'
    return null
  }, [effFrom, effTo, thisWeekStart, thisWeekEnd])

  const PRESET_LABELS: { key: PresetKey; label: string }[] = [
    { key: 'today', label: '오늘' },
    { key: 'yesterday', label: '어제' },
    { key: 'thisWeek', label: '이번 주' },
    { key: 'lastWeek', label: '지난 주' },
    { key: 'thisMonth', label: '이번 달' },
    { key: 'last30', label: '최근 30일' },
  ]

  /** 오늘 상태 카운터 — 한눈에 「누가 왔고, 누가 안왔는지」 파악용 */
  const todaySummary = useMemo(() => {
    const counts = { working: 0, done: 0, pending: 0, off: 0, late: 0 }
    const list = staffList ?? []
    const tg = groupedToday.find((d) => d.dateKey === todayKey)
    for (const s of list) {
      const planned = plannedMap.get(`${s.id}_${todayKey}`)
      const block = tg?.blocks.find((b) => b.staff_id === s.id)
      const aIn = block?.actual?.check_in ?? null
      const aOut = block?.actual?.check_out ?? null
      if (!planned) {
        counts.off++
        continue
      }
      if (aIn && aOut) counts.done++
      else if (aIn) counts.working++
      else counts.pending++
      if (aIn && planned.startHm) {
        const p = hmToMin(planned.startHm)
        const a = isoLocalMin(aIn)
        if (p != null && a != null && a - p > 0) counts.late++
      }
    }
    return counts
  }, [staffList, plannedMap, groupedToday, todayKey])

  const _nowDate = new Date()
  const nowHm = `${String(_nowDate.getHours()).padStart(2, '0')}:${String(_nowDate.getMinutes()).padStart(2, '0')}`

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/25 to-transparent pb-4">
        <CardTitle className="text-lg font-semibold tracking-tight">출퇴근 기록</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          «근무표»에 저장된 주간 슬롯이 예정(계획)으로 표시됩니다. 실제는 출근·퇴근
          기록입니다.{' '}
          <span className="text-muted-foreground">
            (GPS 권장은 실서비스 단계)
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {/* 1) 오늘 — 기간 필터와 무관하게 항상 상단 고정. 헤더·요약·차트·표를 하나의 ring 박스에 묶음. */}
        <section className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border/25 dark:bg-card/95">
          {/* 헤더 — 좌: 오늘 + 현재시각, 우: 상태 요약 배지 */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold tracking-tight">오늘</span>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {dateHeading(todayKey)}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                · 현재 {nowHm}
              </span>
            </div>
            <AttendanceSummaryBadges counts={todaySummary} />
          </div>

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

        {/* 2) 날짜 셀렉 UI — 근무표 필터 패널과 동일 톤. 프리셋 chip row 추가. */}
        <section className="space-y-2.5 rounded-2xl bg-muted/20 p-3 shadow-sm ring-1 ring-border/25 dark:bg-muted/15">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold tracking-tight">조회 기간</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {effFrom || '—'} ~ {effTo || '—'}
            </span>
          </div>
          {/* 프리셋 chip row */}
          <div className="flex flex-wrap items-center gap-1.5 px-0.5">
            {PRESET_LABELS.map(({ key, label }) => {
              const on = activePreset === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150',
                    on
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
                      : 'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45 hover:ring-border/40',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {/* 수동 날짜 입력 */}
          <div className="flex flex-wrap items-end gap-2 px-0.5">
            <div className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">시작 날짜</span>
              <Input
                type="date"
                className="h-9 w-[160px]"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
            </div>
            <span className="pb-2 text-muted-foreground">~</span>
            <div className="grid gap-1">
              <span className="text-[11px] text-muted-foreground">종료 날짜</span>
              <Input
                type="date"
                className="h-9 w-[160px]"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* 3) 셀렉한 기간의 일별 카드 — 오늘은 제외. 과거는 회색, 미래는 그대로. */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold tracking-tight">이전 기록</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {rangeDateKeys.length}일
            </span>
          </div>
          {rangeDateKeys.length === 0 ? (
            <div className="rounded-2xl bg-muted/15 p-6 text-center shadow-sm ring-1 ring-border/25">
              <svg
                className="mx-auto mb-2 size-8 text-muted-foreground/50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18M9 16h.01M13 16h.01M17 16h.01" />
              </svg>
              <p className="text-sm text-muted-foreground">
                해당 기간의 기록이 없습니다.
              </p>
            </div>
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
                      'rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border/25 dark:bg-card/95',
                      isPast && 'opacity-70',
                    )}
                  >
                    <div
                      className={cn(
                        'mb-2 flex items-center gap-2 px-0.5',
                        isPast ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      <svg
                        className="size-4 shrink-0 text-muted-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      <span className="text-sm font-semibold tracking-tight">
                        {dateHeading(dateKey)}
                      </span>
                      {isPast ? (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">
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
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/25 to-transparent pb-4">
        <CardTitle className="text-lg font-semibold tracking-tight">시간대별 체크리스트</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          항목은 매장 공통입니다. 완료 시 로그가 쌓입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
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
