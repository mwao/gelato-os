import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { CostCalculator } from '@/components/recipes/CostCalculator'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { formatAuthErrorMessage } from '@/lib/authErrors'
import { cn } from '@/lib/utils'
import {
  computeTubCost,
  useDeleteRecipe,
  useRecipe,
} from '@/hooks/useRecipes'

function formatKrw(n: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

export function RecipeDetailPage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const navigate = useNavigate()
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(
    recipeId,
  )
  const deleteMut = useDeleteRecipe()

  const [cupsPerTub, setCupsPerTub] = useState('')
  const [sellingPricePerCup, setSellingPricePerCup] = useState('')

  if (!recipeId) {
    return (
      <p className="text-sm text-muted-foreground">잘못된 주소입니다.</p>
    )
  }

  if (isLoading) {
    return <AuthLoading />
  }

  if (isError || !recipe) {
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
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
            <Link
              to="/recipes"
              className={cn(buttonVariants({ variant: 'ghost' }))}
            >
              목록으로
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const tubCost = computeTubCost(recipe.recipe_ingredients)

  async function handleDelete() {
    if (!recipe) return
    if (
      !window.confirm(
        `«${recipe.name}» 레시피를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
      )
    ) {
      return
    }
    try {
      await deleteMut.mutateAsync(recipe.id)
      navigate('/recipes', { replace: true })
    } catch {
      /* optional: surface error */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{recipe.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {recipe.tub_size_g != null
              ? `목표 1통 ${recipe.tub_size_g} g`
              : '목표 용량 미입력'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/recipes/${recipe.id}/edit`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            수정
          </Link>
          <Link
            to="/recipes"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            목록
          </Link>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deleteMut.isPending}
            onClick={() => void handleDelete()}
          >
            삭제
          </Button>
        </div>
      </div>

      {recipe.memo ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">메모</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{recipe.memo}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">배합</CardTitle>
          <CardDescription>
            원가는 재료 단가 × 사용량입니다. 단가가 바뀌면 재료 관리 저장 후 이
            화면을 새로고침하면 반영됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">재료</th>
                <th className="pb-2 pr-3 font-medium">사용량</th>
                <th className="pb-2 pr-3 font-medium">단가</th>
                <th className="pb-2 font-medium text-right">소계</th>
              </tr>
            </thead>
            <tbody>
              {recipe.recipe_ingredients.map((line) => {
                const price = line.ingredient?.unit_price
                const sub =
                  price != null ? line.amount * price : null
                return (
                  <tr
                    key={line.id}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-2 pr-3">
                      {line.ingredient?.name ?? '(삭제된 재료)'}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {line.amount}
                      {line.unit ? ` ${line.unit}` : ''}
                      {line.ratio_pct != null
                        ? ` · ${line.ratio_pct}%`
                        : ''}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {price != null ? formatKrw(price) : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {sub != null ? formatKrw(sub) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CostCalculator
        tubCost={tubCost}
        cupsPerTub={cupsPerTub}
        onCupsPerTubChange={setCupsPerTub}
        sellingPricePerCup={sellingPricePerCup}
        onSellingPricePerCupChange={setSellingPricePerCup}
      />
    </div>
  )
}
