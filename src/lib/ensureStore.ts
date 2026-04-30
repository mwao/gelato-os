import { supabase } from '@/lib/supabase'

export type StoreRow = {
  id: string
  name: string
  owner_id: string
}

const DEFAULT_STORE_NAME = '내 매장'

/** Ensures the authenticated user has at least one store row; creates one if missing. */
export async function ensureStore(ownerId: string): Promise<StoreRow> {
  const { data: existing, error: selectError } = await supabase
    .from('stores')
    .select('id, name, owner_id')
    .eq('owner_id', ownerId)
    .limit(1)
    .maybeSingle()

  if (selectError) throw selectError
  if (existing) return existing as StoreRow

  const { data: inserted, error: insertError } = await supabase
    .from('stores')
    .insert({ owner_id: ownerId, name: DEFAULT_STORE_NAME })
    .select('id, name, owner_id')
    .single()

  if (insertError) throw insertError
  return inserted as StoreRow
}
