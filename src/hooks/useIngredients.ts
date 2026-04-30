import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type IngredientRow = {
  id: string
  store_id: string
  name: string
  unit: string
  unit_price: number
}

function normalizeUnitPrice(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? 0 : n
}

function mapRow(row: Record<string, unknown>): IngredientRow {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    name: String(row.name),
    unit: String(row.unit),
    unit_price: normalizeUnitPrice(row.unit_price),
  }
}

async function fetchIngredients(storeId: string): Promise<IngredientRow[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, store_id, name, unit, unit_price')
    .eq('store_id', storeId)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export function useIngredients() {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['ingredients', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchIngredients(storeId!),
  })
}

export function useCreateIngredient() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { name: string; unit: string; unit_price: number }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          store_id: storeId,
          name: input.name.trim(),
          unit: input.unit.trim(),
          unit_price: input.unit_price,
        })
        .select('id, store_id, name, unit, unit_price')
        .single()

      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients', storeId] })
    },
  })
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      id: string
      name: string
      unit: string
      unit_price: number
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { data, error } = await supabase
        .from('ingredients')
        .update({
          name: input.name.trim(),
          unit: input.unit.trim(),
          unit_price: input.unit_price,
        })
        .eq('id', input.id)
        .eq('store_id', storeId)
        .select('id, store_id, name, unit, unit_price')
        .single()

      if (error) throw error
      return mapRow(data as Record<string, unknown>)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients', storeId] })
    },
  })
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (id: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('ingredients')
        .delete()
        .eq('id', id)
        .eq('store_id', storeId)

      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingredients', storeId] })
    },
  })
}
