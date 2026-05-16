import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type TaskCategoryRow = {
  id: string
  store_id: string
  code: string
  label: string
  display_order: number
}

/** 신규 매장 생성 직후 자동 시드되는 기본 카테고리 6종 */
export const DEFAULT_TASK_CATEGORIES: Array<{
  code: string
  label: string
  display_order: number
}> = [
  { code: 'open', label: '오픈', display_order: 1 },
  { code: 'middle', label: '미들', display_order: 2 },
  { code: 'close', label: '마감', display_order: 3 },
  { code: 'weekly', label: '주간', display_order: 4 },
  { code: 'monthly', label: '월간', display_order: 5 },
  { code: 'other', label: '기타', display_order: 6 },
]

function mapRow(raw: Record<string, unknown>): TaskCategoryRow {
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    code: String(raw.code),
    label: String(raw.label),
    display_order: Number(raw.display_order ?? 0),
  }
}

async function fetchCategories(storeId: string): Promise<TaskCategoryRow[]> {
  const { data, error } = await supabase
    .from('task_categories')
    .select('*')
    .eq('store_id', storeId)
    .order('display_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export function useTaskCategories() {
  const { data: store } = useStore()
  const storeId = store?.id
  return useQuery({
    queryKey: ['taskCategories', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchCategories(storeId!),
    staleTime: 60_000,
  })
}

/** 매장 추가 시 기본 6 카테고리 시드 (앱 측 트리거) */
export async function seedDefaultTaskCategories(storeId: string): Promise<void> {
  const rows = DEFAULT_TASK_CATEGORIES.map((c) => ({
    store_id: storeId,
    code: c.code,
    label: c.label,
    display_order: c.display_order,
  }))
  const { error } = await supabase
    .from('task_categories')
    .insert(rows)
    .select('id')
  if (error) {
    // unique 충돌이면 무시 (이미 백필돼 있는 경우)
    if (!String(error.message).toLowerCase().includes('duplicate')) throw error
  }
}

function randomCode(): string {
  // 8자 base36 — 충돌 확률 매우 낮음 (36^8 ≈ 2.8e12)
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0')
}

export function useCreateTaskCategory() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: { label: string }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const label = input.label.trim()
      if (!label) throw new Error('카테고리 이름을 입력해 주세요.')

      // 매장 내 max display_order
      const { data: existing } = await supabase
        .from('task_categories')
        .select('display_order')
        .eq('store_id', storeId)
        .order('display_order', { ascending: false })
        .limit(1)
      const maxOrder =
        existing && existing[0]
          ? Number((existing[0] as Record<string, unknown>).display_order ?? 0)
          : 0

      // 코드 충돌 회피 — 최대 5번 재시도
      let code = randomCode()
      for (let i = 0; i < 5; i++) {
        const { data: dup } = await supabase
          .from('task_categories')
          .select('id')
          .eq('store_id', storeId)
          .eq('code', code)
          .maybeSingle()
        if (!dup) break
        code = randomCode()
      }

      const { error } = await supabase.from('task_categories').insert({
        store_id: storeId,
        code,
        label,
        display_order: maxOrder + 1,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['taskCategories', storeId],
      })
    },
  })
}

export function useUpdateTaskCategory() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: { id: string; label: string }) => {
      const label = input.label.trim()
      if (!label) throw new Error('카테고리 이름을 입력해 주세요.')
      const { error } = await supabase
        .from('task_categories')
        .update({ label, updated_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['taskCategories', storeId],
      })
      // 카테고리 label 변경은 store_tasks 표시에도 영향 → 캐시 무효화
      void queryClient.invalidateQueries({ queryKey: ['storeTasks', storeId] })
    },
  })
}

export function useDeleteTaskCategory() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: { id: string; code: string }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')

      // 이 카테고리를 쓰는 업무 있으면 차단
      const { data: usages, error: checkErr } = await supabase
        .from('store_tasks')
        .select('id')
        .eq('store_id', storeId)
        .contains('categories', [input.code])
        .limit(1)
      if (checkErr) throw checkErr
      if (usages && usages.length > 0) {
        throw new Error(
          '이 카테고리를 사용하는 업무가 있어 삭제할 수 없습니다. 먼저 해당 업무들의 카테고리를 변경해 주세요.',
        )
      }

      const { error } = await supabase
        .from('task_categories')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['taskCategories', storeId],
      })
    },
  })
}
