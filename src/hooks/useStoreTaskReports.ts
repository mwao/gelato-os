import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { deleteTaskImages } from '@/lib/imageUpload'
import { supabase } from '@/lib/supabase'

export type StoreTaskReportRow = {
  id: string
  store_id: string
  task_id: string
  staff_id: string
  /** YYYY-MM-DD */
  work_date: string
  reported_at: string
  checked: boolean | null
  memo: string | null
  photo_urls: string[]
}

function mapRow(raw: Record<string, unknown>): StoreTaskReportRow {
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    task_id: String(raw.task_id),
    staff_id: String(raw.staff_id),
    work_date: String(raw.work_date),
    reported_at: String(raw.reported_at ?? ''),
    checked: raw.checked == null ? null : Boolean(raw.checked),
    memo: raw.memo == null ? null : String(raw.memo),
    photo_urls: Array.isArray(raw.photo_urls)
      ? (raw.photo_urls as unknown[]).map((p) => String(p))
      : [],
  }
}

/** 특정 날짜의 보고 row 전체 */
export function useStoreTaskReports(workDate: string) {
  const { data: store } = useStore()
  const storeId = store?.id
  return useQuery({
    queryKey: ['storeTaskReports', storeId, workDate],
    enabled: Boolean(storeId) && Boolean(workDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('store_task_reports')
        .select('*')
        .eq('store_id', storeId!)
        .eq('work_date', workDate)
        .order('reported_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
    },
    staleTime: 30_000,
  })
}

export type StoreTaskReportInput = {
  task_id: string
  staff_id: string
  work_date: string
  checked?: boolean | null
  memo?: string | null
  photo_urls?: string[]
}

/**
 * 보고 upsert — UNIQUE(task_id, staff_id, work_date) 충돌 시 갱신.
 * 한 직원이 같은 날 같은 업무에 한 번만 row 생성됨.
 */
export function useUpsertStoreTaskReport() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: StoreTaskReportInput) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase.from('store_task_reports').upsert(
        {
          store_id: storeId,
          task_id: input.task_id,
          staff_id: input.staff_id,
          work_date: input.work_date,
          reported_at: new Date().toISOString(),
          checked: input.checked ?? null,
          memo: input.memo ?? null,
          photo_urls: input.photo_urls ?? [],
        },
        { onConflict: 'task_id,staff_id,work_date' },
      )
      if (error) throw error
    },
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: ['storeTaskReports', storeId, input.work_date],
      })
    },
  })
}

/** 보고 삭제 — 보고 row + 사진들 storage cleanup */
export function useDeleteStoreTaskReport() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id
  return useMutation({
    mutationFn: async (input: {
      id: string
      work_date: string
      photo_urls: string[]
    }) => {
      const { error } = await supabase
        .from('store_task_reports')
        .delete()
        .eq('id', input.id)
      if (error) throw error
      if (input.photo_urls.length > 0) {
        try {
          await deleteTaskImages(input.photo_urls)
        } catch {
          /* best-effort */
        }
      }
    },
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({
        queryKey: ['storeTaskReports', storeId, input.work_date],
      })
    },
  })
}
