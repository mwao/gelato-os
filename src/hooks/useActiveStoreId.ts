import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const STORAGE_KEY = 'gelato-os:active-store-id'

function readActiveStoreId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeActiveStoreId(id: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* 무시 */
  }
}

/**
 * 현재 활성 매장 ID — localStorage 기반.
 * TanStack Query를 글로벌 state 컨테이너로 활용 → 동일 키 구독 컴포넌트들이 동기화됨.
 */
export function useActiveStoreId(): [string | null, (id: string | null) => void] {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['activeStoreId'],
    queryFn: () => readActiveStoreId(),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const setActiveStoreId = useCallback(
    (next: string | null) => {
      writeActiveStoreId(next)
      queryClient.setQueryData(['activeStoreId'], next)
    },
    [queryClient],
  )

  return [data ?? null, setActiveStoreId]
}
