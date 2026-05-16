import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { deleteTaskImages } from '@/lib/imageUpload'
import { supabase } from '@/lib/supabase'

/**
 * v1.5.x — 카테고리 code 는 사용자 정의 가능. task_categories 테이블이 진실의 소스.
 * 'open'/'middle'/'close'/'weekly'/'monthly'/'other' 는 기본 시드 코드일 뿐.
 */
export type TaskCategory = string

export type TaskReportType = 'check' | 'photo' | 'memo'
export type TaskRecurrenceType = 'daily' | 'weekly' | 'monthly' | 'once'

export type StoreTaskRow = {
  id: string
  store_id: string
  /** 다중 카테고리 — 1개 이상. v1.5.x: 단일 → 배열 마이그레이션 (feature7b) */
  categories: TaskCategory[]
  title: string
  description: string | null
  description_images: string[]
  report_type: TaskReportType
  recurrence_type: TaskRecurrenceType
  /** 매주: 0=월 ... 6=일 */
  recurrence_days: number[] | null
  /** 매월: 1~31 */
  recurrence_day_of_month: number | null
  /** 1회성: YYYY-MM-DD */
  one_time_date: string | null
  active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

/**
 * @deprecated v1.5.x — 기본 시드 라벨. 실제 카테고리 라벨은 `useTaskCategories()` 로 조회.
 * UI 폴백·기존 코드 컴파일 호환용으로만 남김.
 */
export const TASK_CATEGORY_LABELS: Record<string, string> = {
  open: '오픈',
  middle: '미들',
  close: '마감',
  weekly: '주간',
  monthly: '월간',
  other: '기타',
}

/** @deprecated v1.5.x — task_categories.display_order 로 결정. */
export const TASK_CATEGORY_ORDER: string[] = [
  'open',
  'middle',
  'close',
  'weekly',
  'monthly',
  'other',
]

export const TASK_REPORT_TYPE_LABELS: Record<TaskReportType, string> = {
  check: '체크',
  photo: '사진',
  memo: '메모',
}

export const TASK_RECURRENCE_LABELS: Record<TaskRecurrenceType, string> = {
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  once: '1회성',
}

/** 0=월, 6=일 */
export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

function mapRow(raw: Record<string, unknown>): StoreTaskRow {
  const reportType = raw.report_type as TaskReportType
  const recurrenceType = raw.recurrence_type as TaskRecurrenceType
  const rawCats = Array.isArray(raw.categories)
    ? (raw.categories as unknown[])
    : []
  // v1.5.x: 카테고리는 사용자 정의 가능 — 화이트리스트 필터 제거. 빈 문자열만 차단.
  const categories = rawCats
    .map((c) => String(c))
    .filter((c): c is string => c.length > 0)
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    categories,
    title: String(raw.title),
    description: raw.description == null ? null : String(raw.description),
    description_images: Array.isArray(raw.description_images)
      ? (raw.description_images as string[])
      : [],
    report_type: reportType,
    recurrence_type: recurrenceType,
    recurrence_days: Array.isArray(raw.recurrence_days)
      ? (raw.recurrence_days as number[])
      : null,
    recurrence_day_of_month:
      raw.recurrence_day_of_month == null
        ? null
        : Number(raw.recurrence_day_of_month),
    one_time_date: raw.one_time_date == null ? null : String(raw.one_time_date),
    active: Boolean(raw.active),
    display_order: Number(raw.display_order ?? 0),
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
  }
}

async function fetchTasks(storeId: string): Promise<StoreTaskRow[]> {
  const { data, error } = await supabase
    .from('store_tasks')
    .select('*')
    .eq('store_id', storeId)
    .order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export function useStoreTasks() {
  const { data: store } = useStore()
  const storeId = store?.id
  return useQuery({
    queryKey: ['storeTasks', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchTasks(storeId!),
    staleTime: 60_000,
  })
}

export type StoreTaskInput = {
  categories: TaskCategory[]
  title: string
  description?: string | null
  description_images?: string[]
  report_type: TaskReportType
  recurrence_type: TaskRecurrenceType
  recurrence_days?: number[] | null
  recurrence_day_of_month?: number | null
  one_time_date?: string | null
  active?: boolean
}

export function useCreateStoreTask() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: StoreTaskInput) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const title = input.title.trim()
      if (!title) throw new Error('업무명을 입력해 주세요.')
      if (input.categories.length === 0)
        throw new Error('카테고리를 1개 이상 선택해 주세요.')

      // 매장 전체에서 max display_order 조회 (다중 카테고리이므로 글로벌 순서)
      const { data: existing } = await supabase
        .from('store_tasks')
        .select('display_order')
        .eq('store_id', storeId)
        .order('display_order', { ascending: false })
        .limit(1)
      const maxOrder =
        existing && existing[0]
          ? Number((existing[0] as Record<string, unknown>).display_order ?? 0)
          : 0

      const { error } = await supabase.from('store_tasks').insert({
        store_id: storeId,
        categories: input.categories,
        title,
        description: input.description ?? null,
        description_images: input.description_images ?? [],
        report_type: input.report_type,
        recurrence_type: input.recurrence_type,
        recurrence_days:
          input.recurrence_type === 'weekly'
            ? (input.recurrence_days ?? null)
            : null,
        recurrence_day_of_month:
          input.recurrence_type === 'monthly'
            ? (input.recurrence_day_of_month ?? null)
            : null,
        one_time_date:
          input.recurrence_type === 'once'
            ? (input.one_time_date ?? null)
            : null,
        active: input.active ?? true,
        display_order: maxOrder + 1,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storeTasks', storeId] })
    },
  })
}

export type StoreTaskUpdate = { id: string } & Partial<StoreTaskInput>

export function useUpdateStoreTask() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: StoreTaskUpdate) => {
      const { id, ...rest } = input
      const updates: Record<string, unknown> = {
        ...rest,
        updated_at: new Date().toISOString(),
      }
      // 반복 타입 변경 시 무관 필드 null로 클리어
      if (rest.recurrence_type !== undefined) {
        if (rest.recurrence_type !== 'weekly') updates.recurrence_days = null
        if (rest.recurrence_type !== 'monthly')
          updates.recurrence_day_of_month = null
        if (rest.recurrence_type !== 'once') updates.one_time_date = null
      }
      const { error } = await supabase
        .from('store_tasks')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storeTasks', storeId] })
    },
  })
}

export function useDeleteStoreTask() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (id: string) => {
      // 1. 이미지 path 조회 (삭제 후 storage cleanup용)
      const { data: row } = await supabase
        .from('store_tasks')
        .select('description_images')
        .eq('id', id)
        .maybeSingle()
      const imagePaths = Array.isArray(row?.description_images)
        ? (row?.description_images as unknown[])
            .map((p) => String(p))
            .filter((p) => p.length > 0)
        : []

      // 2. row 삭제
      const { error } = await supabase
        .from('store_tasks')
        .delete()
        .eq('id', id)
      if (error) throw error

      // 3. storage cleanup (best-effort — 실패해도 row 삭제 자체는 성공)
      if (imagePaths.length > 0) {
        try {
          await deleteTaskImages(imagePaths)
        } catch {
          /* 무시 */
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['storeTasks', storeId] })
    },
  })
}

/** 업무 한 줄을 사람이 읽는 반복주기 문자열로 — 예: 「매주 월·수·금」, 「매월 15일」 */
export function describeRecurrence(task: StoreTaskRow): string {
  switch (task.recurrence_type) {
    case 'daily':
      return '매일'
    case 'weekly': {
      const days = task.recurrence_days ?? []
      if (days.length === 0) return '매주'
      const labels = days
        .slice()
        .sort()
        .map((d) => WEEKDAY_LABELS[d] ?? '')
        .filter(Boolean)
      return `매주 ${labels.join('·')}`
    }
    case 'monthly': {
      const d = task.recurrence_day_of_month
      return d ? `매월 ${d}일` : '매월'
    }
    case 'once': {
      const d = task.one_time_date
      if (!d) return '1회성'
      // 오늘/내일 표시
      const todayKey = ymdLocal(new Date())
      const tmrKey = ymdLocal(addDays(new Date(), 1))
      if (d === todayKey) return '1회성 · 오늘'
      if (d === tmrKey) return '1회성 · 내일'
      return `1회성 · ${d}`
    }
  }
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(d: Date, delta: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + delta)
  return r
}

/** 1회성 날짜 헬퍼 — 폼에서 「오늘」/「내일」 프리셋용. YYYY-MM-DD 반환. */
export function todayYmd(): string {
  return ymdLocal(new Date())
}
export function tomorrowYmd(): string {
  return ymdLocal(addDays(new Date(), 1))
}
