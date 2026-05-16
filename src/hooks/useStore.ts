import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/auth-context'
import { useActiveStoreId } from '@/hooks/useActiveStoreId'
import { seedDefaultTaskCategories } from '@/hooks/useTaskCategories'
import {
  createStoreForOwner,
  fetchStoresForOwner,
  type CreateStoreInput,
  type StoreRow,
} from '@/lib/ensureStore'
import { supabase } from '@/lib/supabase'

/**
 * 현재 활성 매장 (없으면 undefined).
 * v1.6: localStorage active-store-id + storeList 의 교집합으로 derive.
 *  - active id가 list에 없으면 첫 매장으로 fallback.
 *  - list가 0개면 undefined (Onboarding으로 리다이렉트).
 *
 * 반환 shape은 기존 `useQuery` 결과와 호환되도록 `data/isLoading/isError/error/refetch`만 노출.
 */
export function useStore(): {
  data: StoreRow | undefined
  isLoading: boolean
  isError: boolean
  error: unknown
  refetch: () => void
} {
  const list = useStoreList()
  const [activeId] = useActiveStoreId()

  const stores = list.data ?? []
  let active: StoreRow | undefined
  if (stores.length > 0) {
    if (activeId) {
      active = stores.find((s) => s.id === activeId) ?? stores[0]
    } else {
      active = stores[0]
    }
  }

  return {
    data: active,
    isLoading: list.isLoading,
    isError: list.isError,
    error: list.error,
    refetch: () => {
      void list.refetch()
    },
  }
}

/** 사장님 보유 매장 전체. Onboarding guard·매장 셀렉터·매장 목록 화면에서 사용. */
export function useStoreList() {
  const { session, isReady } = useAuth()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ['storeList', userId],
    enabled: isReady && Boolean(userId),
    queryFn: () => fetchStoresForOwner(),
    staleTime: 1000 * 60 * 5,
  })
}

/** 신규 매장 생성 — Onboarding + 「+ 매장 추가」 모달 공용 뮤테이션. */
export function useCreateStore() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateStoreInput): Promise<StoreRow> => {
      if (!userId) throw new Error('로그인이 필요합니다.')
      const store = await createStoreForOwner(userId, input)
      // 기본 6개 카테고리 시드 (조용히 실패 — 중복은 무시)
      try {
        await seedDefaultTaskCategories(store.id)
      } catch {
        /* 시드 실패는 매장 생성 자체를 막지 않음 */
      }
      return store
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['store'] })
      void queryClient.invalidateQueries({ queryKey: ['storeList'] })
    },
  })
}

/** 매장 기본 정보 업데이트 — MY 페이지에서 사용. */
export type StoreInfoUpdate = {
  storeId: string
  name: string
  business_no: string | null
  owner_name: string | null
  address: string | null
  phone: string | null
}

export function useUpdateStoreInfo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: StoreInfoUpdate): Promise<StoreRow> => {
      const { storeId, ...rest } = input
      const { data, error } = await supabase
        .from('stores')
        .update(rest)
        .eq('id', storeId)
        .select(
          'id, name, owner_id, shift_open_start, shift_open_end, shift_middle_start, shift_middle_end, shift_close_start, shift_close_end, business_no, owner_name, address, phone, store_account_user_id, store_account_email',
        )
        .single()
      if (error) throw error
      return data as StoreRow
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store'] })
      queryClient.invalidateQueries({ queryKey: ['storeList'] })
    },
  })
}
