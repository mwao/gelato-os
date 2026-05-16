import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export type CreateStoreAccountInput = {
  storeId: string
  /** 매장 ID — 합성 이메일의 prefix가 됨 (예: "gangnam") */
  accountId: string
  password: string
}

export type CreatedStoreAccount = {
  user_id: string
  /** 사용자가 입력한 매장 ID (예: "gangnam") */
  account_id: string
  /** 합성 이메일 (예: "gangnam@store.gelato.local") — 내부 저장용 */
  email: string
  store_id: string
}

/** Edge Function 응답에서 한국어 에러 메시지 추출. */
async function extractErrorMessage(
  rawError: unknown,
  fallback: string,
): Promise<string> {
  // supabase.functions.invoke 의 error는 FunctionsHttpError 형태 — context.body에 응답
  const err = rawError as { message?: string; context?: Response } | null
  if (!err) return fallback
  try {
    const ctx = err.context
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null)
      if (j?.error) return String(j.error)
    }
  } catch {
    /* 무시 */
  }
  return err.message ?? fallback
}

export function useCreateStoreAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateStoreAccountInput): Promise<CreatedStoreAccount> => {
      const { data, error } = await supabase.functions.invoke(
        'create-store-account',
        {
          body: {
            store_id: input.storeId,
            account_id: input.accountId,
            password: input.password,
          },
        },
      )
      if (error) throw new Error(await extractErrorMessage(error, '매장 계정 발급에 실패했습니다.'))
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String((data as { error: unknown }).error))
      }
      return data as CreatedStoreAccount
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['store'] })
      void queryClient.invalidateQueries({ queryKey: ['storeList'] })
    },
  })
}

export function useDeleteStoreAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { storeId: string }): Promise<void> => {
      const { data, error } = await supabase.functions.invoke(
        'delete-store-account',
        { body: { store_id: input.storeId } },
      )
      if (error) throw new Error(await extractErrorMessage(error, '매장 계정 삭제에 실패했습니다.'))
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(String((data as { error: unknown }).error))
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['store'] })
      void queryClient.invalidateQueries({ queryKey: ['storeList'] })
    },
  })
}
