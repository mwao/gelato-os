import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import type { ShiftCode } from '@/hooks/useStaff'
import { supabase } from '@/lib/supabase'

export type ChecklistItemRow = {
  id: string
  shift: ShiftCode
  title: string
}

function mapItem(raw: Record<string, unknown>): ChecklistItemRow | null {
  const sh = raw.shift as string
  if (sh !== 'open' && sh !== 'middle' && sh !== 'close') return null
  return {
    id: String(raw.id),
    shift: sh,
    title: String(raw.title),
  }
}

async function fetchItems(storeId: string, shift: ShiftCode): Promise<ChecklistItemRow[]> {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('id, shift, title')
    .eq('store_id', storeId)
    .eq('shift', shift)
    .order('title')

  if (error) throw error
  return (data ?? [])
    .map((r) => mapItem(r as Record<string, unknown>))
    .filter((x): x is ChecklistItemRow => x !== null)
}

export function useChecklistItems(shift: ShiftCode) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['checklistItems', storeId, shift],
    enabled: Boolean(storeId),
    queryFn: () => fetchItems(storeId!, shift),
  })
}

export function useCreateChecklistItem() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { shift: ShiftCode; title: string }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const title = input.title.trim()
      if (!title) throw new Error('항목 내용을 입력해 주세요.')

      const { error } = await supabase.from('checklist_items').insert({
        store_id: storeId,
        shift: input.shift,
        title,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['checklistItems', storeId, v.shift],
      })
    },
  })
}

export function useDeleteChecklistItem() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { id: string; shift: ShiftCode }) => {
      const { error } = await supabase.from('checklist_items').delete().eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['checklistItems', storeId, v.shift],
      })
    },
  })
}

async function fetchLogsToday(
  storeId: string,
  staffId: string,
): Promise<Set<string>> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data, error } = await supabase
    .from('checklist_logs')
    .select('checklist_item_id')
    .eq('store_id', storeId)
    .eq('staff_id', staffId)
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString())

  if (error) throw error

  const items = new Set<string>()
  for (const row of data ?? []) {
    const itemId = (row as { checklist_item_id?: string }).checklist_item_id
    if (itemId) items.add(itemId)
  }
  return items
}

export function useChecklistCompletionToday(
  shift: ShiftCode,
  staffId: string | undefined,
) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['checklistLogsToday', storeId, shift, staffId],
    enabled: Boolean(storeId && staffId),
    queryFn: async () => {
      const items = await fetchItems(storeId!, shift)
      const doneAll = await fetchLogsToday(storeId!, staffId!)
      const itemIds = new Set(items.map((i) => i.id))
      const doneIds = new Set([...doneAll].filter((id) => itemIds.has(id)))
      return { items, doneIds }
    },
  })
}

export function useCompleteChecklistItem() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      checklistItemId: string
      staffId: string
      shift: ShiftCode
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase.from('checklist_logs').insert({
        store_id: storeId,
        checklist_item_id: input.checklistItemId,
        staff_id: input.staffId,
      })
      if (error) throw error
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['checklistLogsToday', storeId, v.shift, v.staffId],
      })
    },
  })
}
