import { useQuery } from '@tanstack/react-query'

import { getSignedUrls } from '@/lib/imageUpload'

/**
 * Storage path 배열을 받아 signed URL 매핑을 반환.
 * - 동일한 paths(정렬 후)이면 캐시 재사용.
 * - 50분마다 자동 refetch (signed URL은 60분 만료 기본).
 */
export function useSignedUrls(paths: string[]) {
  const key = paths.slice().sort().join('|')
  return useQuery({
    queryKey: ['signedUrls', key],
    enabled: paths.length > 0,
    queryFn: async () => {
      const m = await getSignedUrls(paths, 3600)
      const out: Record<string, string> = {}
      for (const [k, v] of m) out[k] = v
      return out
    },
    staleTime: 1000 * 60 * 50,
  })
}
