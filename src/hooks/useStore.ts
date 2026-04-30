import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/auth-context'
import { ensureStore } from '@/lib/ensureStore'

/** Current user's primary store (creates default row on first load). */
export function useStore() {
  const { session, isReady } = useAuth()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ['store', userId],
    enabled: isReady && Boolean(userId),
    queryFn: () => ensureStore(userId!),
    staleTime: 1000 * 60 * 5,
  })
}
