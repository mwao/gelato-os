import type { ShiftCode } from '@/hooks/useStaff'

/** Local calendar date YYYY-MM-DD */
export function formatYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday 00:00 local for the week containing `d` */
export function startOfIsoWeekMonday(d: Date): Date {
  const x = new Date(d)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

/** 월요일 weekStart(YYYY-MM-DD)부터 workDate까지 일 수 (0~6). 범위 밖이면 null */
export function dayIndexInIsoWeek(
  weekStartYmd: string,
  workDateYmd: string,
): number | null {
  const a = parseYmdLocal(weekStartYmd)
  const b = parseYmdLocal(workDateYmd)
  a.setHours(0, 0, 0, 0)
  b.setHours(0, 0, 0, 0)
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000)
  if (diff < 0 || diff > 6) return null
  return diff
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map(Number)
  return new Date(y, m - 1, day)
}

/** Number of days in month (1-based month) */
export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

export const WEEK_SLOT_LABELS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
] as const

/** 월간 시프트 → 주간 그리드 대표 슬롯(앵커). 미세 조정은 주간 셀에서 수동. */
export const SHIFT_ANCHOR_SLOT_INDEX: Record<'open' | 'middle' | 'close', number> = {
  open: 0,
  middle: 5,
  close: 10,
}

export function parseWeekSlotLabel(slotIndex: number): { hour: number; minute: number } {
  const label = WEEK_SLOT_LABELS[slotIndex]
  if (!label) return { hour: 9, minute: 0 }
  const [h, m] = label.split(':').map(Number)
  return { hour: h ?? 9, minute: m ?? 0 }
}

/** 로컬 calendar day + 슬롯 시작 시각 */
export function dateAtSlotStartLocal(baseDay: Date, slotIndex: number): Date {
  const { hour, minute } = parseWeekSlotLabel(slotIndex)
  const d = new Date(baseDay)
  d.setHours(hour, minute, 0, 0)
  return d
}

/**
 * 프로토타입 v1.5 정렬: 마지막 슬롯 라벨 시각에 +1시간을 퇴근으로 둠.
 */
export function checkoutFromLastSlotLocal(baseDay: Date, lastSlotIndex: number): Date {
  const { hour, minute } = parseWeekSlotLabel(lastSlotIndex)
  const d = new Date(baseDay)
  d.setHours(hour + 1, minute, 0, 0)
  return d
}

export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 주간 그리드 열: `day_index` 0=월 … 6=일 (`schedule_week_slots` 와 동일) */
export const WEEK_GRID_DOW_KO = ['월', '화', '수', '목', '금', '토', '일'] as const

export const SHIFT_LABEL: Record<string, string> = {
  open: '오픈',
  middle: '미들',
  close: '마감',
}

export type ShiftTimeSettings = {
  open: { start: string; end: string }
  middle: { start: string; end: string }
  close: { start: string; end: string }
}

export const DEFAULT_SHIFT_TIME_SETTINGS: ShiftTimeSettings = {
  open: { start: '09:00', end: '14:00' },
  middle: { start: '14:00', end: '19:00' },
  close: { start: '19:00', end: '22:00' },
}

export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10))
  if (Number.isNaN(h)) return 0
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

/** 슬롯 시작분(09:00=540 …)과 [a,b) 분 구간 겹침 */
export function slotIndicesForShiftWindow(
  shift: ShiftCode,
  settings: ShiftTimeSettings,
): number[] {
  const { start, end } = settings[shift]
  const a = parseHmToMinutes(start)
  const b = parseHmToMinutes(end)
  if (b <= a) return []
  const out: number[] = []
  for (let i = 0; i < WEEK_SLOT_LABELS.length; i++) {
    const slotStartMin = (9 + i) * 60
    const slotEndMin = slotStartMin + 60
    if (slotEndMin > a && slotStartMin < b) out.push(i)
  }
  return out
}

/** 슬롯이 근무관리 시간대 중 어디에 속하는지 (열 순 오픈→미들→마감, 겹치면 앞선 구간). 없으면 null */
export function shiftForSlotIndex(
  slotIndex: number,
  settings: ShiftTimeSettings,
): ShiftCode | null {
  const order: ShiftCode[] = ['open', 'middle', 'close']
  for (const code of order) {
    if (slotIndicesForShiftWindow(code, settings).includes(slotIndex)) return code
  }
  return null
}

/** 주간 표 시간 행 배경 (근무관리 구간별 연한 틴트) */
export function weekSlotBandBgClass(shift: ShiftCode | null): string {
  if (shift === 'open') return 'bg-primary/[0.08]'
  if (shift === 'middle') return 'bg-blue-500/[0.09]'
  if (shift === 'close') return 'bg-amber-500/[0.10]'
  return 'bg-muted/20'
}

/** 프로필 요일(일=0 … 토=6, JS getDay) → 주간표 day_index(월=0 … 일=6) */
export function profileDowToWeekDayIndex(dow: number): number {
  return (dow + 6) % 7
}

/** 슬롯 인덱스들로 예정 근무 시간대 문구 (첫 슬롯 ~ 마지막슬롯+1h) */
export function formatPlannedSlotRange(slotIndices: number[]): string {
  if (!slotIndices.length) return ''
  const sorted = [...new Set(slotIndices)].sort((a, b) => a - b)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const start = WEEK_SLOT_LABELS[first] ?? '09:00'
  const { hour, minute } = parseWeekSlotLabel(last)
  const endHm = `${String(hour + 1).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return `${start} ~ ${endHm}`
}

export function shiftBadgeClass(shift: string): string {
  if (shift === 'open') return 'bg-primary/15 text-primary'
  if (shift === 'middle') return 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
  if (shift === 'close') return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  return 'bg-muted text-muted-foreground'
}

/** 주간 칸 안 근무자 칩 — 셀은 단색, 시프트는 좌측 액센트만 */
export function weekStaffChipShellClass(shift: ShiftCode | null): string {
  const base =
    'flex w-full min-w-0 items-center gap-0.5 rounded-md border border-border/55 bg-background px-1.5 py-0.5 pl-1.5 text-[11px] font-medium leading-tight text-foreground shadow-sm dark:bg-card'
  if (shift === 'open') return `${base} border-l-[3px] border-l-primary`
  if (shift === 'middle') return `${base} border-l-[3px] border-l-blue-500`
  if (shift === 'close') return `${base} border-l-[3px] border-l-amber-500`
  return base
}
