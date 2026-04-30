import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type ShiftCode = 'open' | 'middle' | 'close'

export type StaffListRow = {
  id: string
  store_id: string
  name: string
  phone: string | null
  hourly_rate: number
  hire_date: string | null
  health_cert_expires: string | null
  employment_type_id: string | null
  employment_label: string | null
}

export type StaffDefaultShiftRow = {
  id: string
  staff_id: string
  day_of_week: number
  shift: ShiftCode
}

export type StaffDetail = StaffListRow & {
  default_shifts: StaffDefaultShiftRow[]
}

function num(v: unknown): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  const n = parseFloat(String(v))
  return Number.isNaN(n) ? 0 : n
}

function mapStaffList(raw: Record<string, unknown>): StaffListRow {
  let employment_label: string | null = null
  const et = raw.employment_types
  if (et && typeof et === 'object' && !Array.isArray(et)) {
    employment_label =
      typeof (et as { label?: string }).label === 'string'
        ? (et as { label: string }).label
        : null
  }
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    name: String(raw.name),
    phone: raw.phone == null ? null : String(raw.phone),
    hourly_rate: num(raw.hourly_rate),
    hire_date: raw.hire_date == null ? null : String(raw.hire_date),
    health_cert_expires:
      raw.health_cert_expires == null ? null : String(raw.health_cert_expires),
    employment_type_id:
      raw.employment_type_id == null ? null : String(raw.employment_type_id),
    employment_label,
  }
}

function mapDefaultShift(raw: Record<string, unknown>): StaffDefaultShiftRow | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const staff_id = typeof raw.staff_id === 'string' ? raw.staff_id : null
  const dow =
    typeof raw.day_of_week === 'number' ? raw.day_of_week : Number(raw.day_of_week)
  const shift = raw.shift as string
  if (!id || !staff_id || Number.isNaN(dow) || dow < 0 || dow > 6) return null
  if (shift !== 'open' && shift !== 'middle' && shift !== 'close') return null
  return { id, staff_id, day_of_week: dow, shift }
}

async function fetchStaffList(storeId: string): Promise<StaffListRow[]> {
  const { data, error } = await supabase
    .from('staff')
    .select(
      `
      id, store_id, name, phone, hourly_rate, hire_date, health_cert_expires, employment_type_id,
      employment_types ( label )
    `,
    )
    .eq('store_id', storeId)
    .order('name')

  if (error) throw error
  return (data ?? []).map((r) => mapStaffList(r as Record<string, unknown>))
}

async function fetchStaffDetail(
  storeId: string,
  staffId: string,
): Promise<StaffDetail> {
  const { data, error } = await supabase
    .from('staff')
    .select(
      `
      id, store_id, name, phone, hourly_rate, hire_date, health_cert_expires, employment_type_id,
      employment_types ( label ),
      staff_default_shifts ( id, staff_id, day_of_week, shift )
    `,
    )
    .eq('store_id', storeId)
    .eq('id', staffId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('직원을 찾을 수 없습니다.')

  const raw = data as Record<string, unknown>
  const base = mapStaffList(raw)
  const shiftsRaw = raw.staff_default_shifts
  const arr = Array.isArray(shiftsRaw) ? shiftsRaw : []
  const default_shifts = arr
    .map((x) => mapDefaultShift(x as Record<string, unknown>))
    .filter((x): x is StaffDefaultShiftRow => x !== null)

  return { ...base, default_shifts }
}

export function useStaffList() {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['staff', 'list', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchStaffList(storeId!),
  })
}

export function useStaffDetail(staffId: string | undefined) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['staff', 'detail', staffId],
    enabled: Boolean(storeId && staffId),
    queryFn: () => fetchStaffDetail(storeId!, staffId!),
  })
}

export type StaffInput = {
  name: string
  phone: string | null
  hourly_rate: number
  employment_type_id: string | null
  hire_date: string | null
  health_cert_expires: string | null
}

export function useCreateStaff() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: StaffInput) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { data, error } = await supabase
        .from('staff')
        .insert({
          store_id: storeId,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          hourly_rate: input.hourly_rate,
          employment_type_id: input.employment_type_id,
          hire_date: input.hire_date,
          health_cert_expires: input.health_cert_expires,
        })
        .select(
          'id, store_id, name, phone, hourly_rate, hire_date, health_cert_expires, employment_type_id',
        )
        .single()

      if (error) throw error
      const row = data as Record<string, unknown>
      return mapStaffList({
        ...row,
        employment_types: null,
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'list', storeId] })
    },
  })
}

export function useUpdateStaff() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: StaffInput & { id: string }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('staff')
        .update({
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          hourly_rate: input.hourly_rate,
          employment_type_id: input.employment_type_id,
          hire_date: input.hire_date,
          health_cert_expires: input.health_cert_expires,
        })
        .eq('id', input.id)
        .eq('store_id', storeId)

      if (error) throw error
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'list', storeId] })
      void queryClient.invalidateQueries({
        queryKey: ['staff', 'detail', v.id],
      })
    },
  })
}

export function useDeleteStaff() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (staffId: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffId)
        .eq('store_id', storeId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff', storeId] })
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export type DefaultShiftInput = { day_of_week: number; shift: ShiftCode }

export function useReplaceStaffDefaultShifts() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: { staffId: string; shifts: DefaultShiftInput[] }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')

      const { error: delErr } = await supabase
        .from('staff_default_shifts')
        .delete()
        .eq('staff_id', input.staffId)

      if (delErr) throw delErr

      if (input.shifts.length === 0) return

      const rows = input.shifts.map((s) => ({
        store_id: storeId,
        staff_id: input.staffId,
        day_of_week: s.day_of_week,
        shift: s.shift,
      }))

      const { error: insErr } = await supabase.from('staff_default_shifts').insert(rows)
      if (insErr) throw insErr
    },
    onSuccess: (_, v) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'detail', v.staffId] })
      void queryClient.invalidateQueries({ queryKey: ['staff', 'list', storeId] })
    },
  })
}
