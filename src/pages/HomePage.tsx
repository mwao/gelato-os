import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: store, isLoading, isError, error, refetch } = useStore()

  async function handleSignOut() {
    await supabase.auth.signOut()
    queryClient.removeQueries({ queryKey: ['store'] })
    queryClient.removeQueries({ queryKey: ['ingredients'] })
    navigate('/login', { replace: true })
  }

  if (isLoading) {
    return <AuthLoading />
  }

  if (isError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">매장 정보를 불러오지 못했습니다</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : String(error)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
            <Button type="button" variant="ghost" onClick={handleSignOut}>
              로그아웃
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        매장이 준비되었습니다. 왼쪽 메뉴의 «재료 관리»에서 원부재료를 등록할 수
        있습니다.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">현재 매장</CardTitle>
          <CardDescription>
            최초 로그인 시 자동으로 만들어진 매장입니다. 이름은 이후 설정에서 바꿀 수
            있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">이름 </span>
            <span className="font-medium">{store?.name}</span>
          </div>
          <div className="break-all font-mono text-xs text-muted-foreground">
            <span className="select-none">매장 ID </span>
            {store?.id}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
