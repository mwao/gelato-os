import type { StoreTaskRow } from '@/hooks/useStoreTasks'

/** Local timezone YYYY-MM-DD */
export function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** 0=월 ... 6=일 (recurrence_days 와 동일 기준) */
function dowMon0(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** 주어진 날짜에 이 업무가 보고 대상인지 — active=false 는 항상 제외. */
export function isTaskDueOnDate(task: StoreTaskRow, date: Date): boolean {
  if (!task.active) return false
  switch (task.recurrence_type) {
    case 'daily':
      return true
    case 'weekly':
      return (task.recurrence_days ?? []).includes(dowMon0(date))
    case 'monthly':
      return task.recurrence_day_of_month === date.getDate()
    case 'once':
      return task.one_time_date === ymdLocal(date)
  }
}
