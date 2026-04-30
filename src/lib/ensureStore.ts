import { supabase } from '@/lib/supabase'

export type StoreRow = {
  id: string
  name: string
  owner_id: string
  shift_open_start: string | null
  shift_open_end: string | null
  shift_middle_start: string | null
  shift_middle_end: string | null
  shift_close_start: string | null
  shift_close_end: string | null
}

const DEFAULT_STORE_NAME = '내 매장'

/** Ensures the authenticated user has at least one store row; creates one if missing. */
export async function ensureStore(ownerId: string): Promise<StoreRow> {
  const { data: existing, error: selectError } = await supabase
    .from('stores')
    .select(
      'id, name, owner_id, shift_open_start, shift_open_end, shift_middle_start, shift_middle_end, shift_close_start, shift_close_end',
    )
    .eq('owner_id', ownerId)
    .limit(1)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing) return existing as StoreRow

  const { data: inserted, error: insertError } = await supabase
    .from('stores')
    .insert({ owner_id: ownerId, name: DEFAULT_STORE_NAME })
    .select(
      'id, name, owner_id, shift_open_start, shift_open_end, shift_middle_start, shift_middle_end, shift_close_start, shift_close_end',
    )
    .single()

  if (insertError) throw insertError
  return inserted as StoreRow
}
