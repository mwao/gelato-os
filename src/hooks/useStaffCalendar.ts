import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import type { ShiftCode } from '@/hooks/useStaff'
import { supabase } from '@/lib/supabase'

export type CalendarAssignment = {
  id: string
  staff_id: string
  yyyymm: string
  day: number
  shift: ShiftCode
}

function mapRow(raw: Record<string, unknown>): CalendarAssignment | null {
  const shift = raw.shift as string
  if (shift !== 'open' && shift !== 'middle' && shift !== 'close') return null
  const day = Number(raw.day)
  if (Number.isNaN(day) || day < 1 || day > 31) return null
  return {
    id: String(raw.id),
    staff_id: String(raw.staff_id),
    yyyymm: String(raw.yyyymm),
    day,
    shift,
  }
}

async function fetchCalendar(
  storeId: string,
  staffId: string,
  yyyymm: string,
): Promise<CalendarAssignment[]> {
  const { data, error } = await supabase
    .from('staff_calendar_assignments')
    .select('id, staff_id, yyyymm, day, shift')
    .eq('store_id', storeId)
    .eq('staff_id', staffId)
    .eq('yyyymm', yyyymm)

  if (error) throw error
  return (data ?? [])
    .map((r) => mapRow(r as Record<string, unknown>))
    .filter((x): x is CalendarAssignment => x !== null)
}

export function useStaffCalendar(staffId: string | undefined, yyyymm: string) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['staffCalendar', staffId, yyyymm],
    enabled: Boolean(storeId && staffId && yyyymm.length === 7),
    queryFn: () => fetchCalendar(storeId!, staffId!, yyyymm),
  })
}

export function useUpsertCalendarCell() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      staffId: string
      yyyymm: string
      day: number
      shift: ShiftCode | null
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')

      if (input.shift === null) {
        const { error } = await supabase
          .from('staff_calendar_assignments')
          .delete()
          .eq('store_id', storeId)
          .eq('staff_id', input.staffId)
          .eq('yyyymm', input.yyyymm)
          .eq('day', input.day)
        if (error) throw error

        const workDate = `${input.yyyymm}-${String(input.day).padStart(2, '0')}`
        const { error: mErr } = await supabase
          .from('schedule_month_cells')
          .delete()
          .eq('store_id', storeId)
          .eq('staff_id', input.staffId)
          .eq('work_date', workDate)
        if (mErr) throw mErr
        return
      }

      const workDate = `${input.yyyymm}-${String(input.day).padStart(2, '0')}`

      const { error: d1 } = await supabase
        .from('staff_calendar_assignments')
        .delete()
        .eq('store_id', storeId)
        .eq('staff_id', input.staffId)
        .eq('yyyymm', input.yyyymm)
        .eq('day', input.day)
      if (d1) throw d1

      const { error } = await supabase.from('staff_calendar_assignments').insert({
        store_id: storeId,
        staff_id: input.staffId,
        yyyymm: input.yyyymm,
        day: input.day,
        shift: input.shift,
      })

      if (error) throw error

      const { error: cellErr } = await supabase.from('schedule_month_cells').upsert(
        {
          store_id: storeId,
          staff_id: input.staffId,
          work_date: workDate,
          shift: input.shift,
        },
        { onConflict: 'staff_id,work_date' },
      )
      if (cellErr) throw cellErr
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({
        queryKey: ['staffCalendar', v.staffId, v.yyyymm],
      })
      void queryClient.invalidateQueries({
        queryKey: ['monthSchedule', storeId],
      })
    },
  })
}
