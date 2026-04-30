import { Link } from 'react-router-dom'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatAuthErrorMessage } from '@/lib/authErrors'
import { useRecipes } from '@/hooks/useRecipes'
import { useStore as useStoreQuery } from '@/hooks/useStore'

export function RecipesPage() {
  const { isLoading: storeLoading } = useStoreQuery()
  const {
    data: recipes,
    isLoading: listLoading,
    isError,
    error,
    refetch,
  } = useRecipes()

  if (storeLoading || listLoading) {
    return <AuthLoading />
  }

  if (isError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">
              레시피를 불러오지 못했습니다
            </CardTitle>
            <CardDescription>
              {formatAuthErrorMessage(
                error instanceof Error ? error.message : String(error),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            레시피와 배합표를 등록하면 1통 원가를 자동으로 계산할 수 있습니다.
          </p>
        </div>
        <Link
          to="/recipes/new"
          className={cn(buttonVariants())}
        >
          새 레시피
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록된 레시피</CardTitle>
          <CardDescription>
            이름을 누르면 상세에서 원가와 배합을 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!recipes?.length ? (
            <p className="text-sm text-muted-foreground">
              아직 레시피가 없습니다. «새 레시피»로 첫 배합을 추가해 보세요.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/50">
              {recipes.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/recipes/${r.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.tub_size_g != null
                        ? `목표 1통 ${r.tub_size_g}g`
                        : '용량 미입력'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
