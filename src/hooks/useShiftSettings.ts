import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/auth-context'
import {
  DEFAULT_SHIFT_TIME_SETTINGS,
  type ShiftTimeSettings,
} from '@/lib/dateUtils'
import { ensureStore, type StoreRow } from '@/lib/ensureStore'
import { supabase } from '@/lib/supabase'

export function storeRowToShiftSettings(row: StoreRow): ShiftTimeSettings {
  return {
    open: {
      start: row.shift_open_start ?? DEFAULT_SHIFT_TIME_SETTINGS.open.start,
      end: row.shift_open_end ?? DEFAULT_SHIFT_TIME_SETTINGS.open.end,
    },
    middle: {
      start: row.shift_middle_start ?? DEFAULT_SHIFT_TIME_SETTINGS.middle.start,
      end: row.shift_middle_end ?? DEFAULT_SHIFT_TIME_SETTINGS.middle.end,
    },
    close: {
      start: row.shift_close_start ?? DEFAULT_SHIFT_TIME_SETTINGS.close.start,
      end: row.shift_close_end ?? DEFAULT_SHIFT_TIME_SETTINGS.close.end,
    },
  }
}

export function useShiftTimeSettings() {
  const { session, isReady } = useAuth()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ['shiftTimeSettings', userId],
    enabled: isReady && Boolean(userId),
    queryFn: async () => {
      const store = await ensureStore(userId!)
      return { store, settings: storeRowToShiftSettings(store) }
    },
    staleTime: 60_000,
  })
}

export function useUpdateShiftTimeSettings() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user?.id

  return useMutation({
    mutationFn: async (input: ShiftTimeSettings) => {
      const store = await ensureStore(userId!)
      const { error } = await supabase
        .from('stores')
        .update({
          shift_open_start: input.open.start,
          shift_open_end: input.open.end,
          shift_middle_start: input.middle.start,
          shift_middle_end: input.middle.end,
          shift_close_start: input.close.start,
          shift_close_end: input.close.end,
        })
        .eq('id', store.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shiftTimeSettings', userId] })
    },
  })
}
