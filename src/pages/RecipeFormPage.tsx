import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { formatAuthErrorMessage } from '@/lib/authErrors'
import {
  useCreateRecipe,
  useRecipe,
  useUpdateRecipe,
  type RecipeDetail,
  type RecipeLineInput,
} from '@/hooks/useRecipes'
import { useIngredients } from '@/hooks/useIngredients'
import {
  emptyRecipeDraft,
  useRecipeFormStore,
  type RecipeDraft,
} from '@/stores/recipeFormStore'

function recipeToDraft(r: RecipeDetail): RecipeDraft {
  return {
    name: r.name,
    tub_size_g: r.tub_size_g != null ? String(r.tub_size_g) : '',
    memo: r.memo ?? '',
    lines: r.recipe_ingredients.map((line) => ({
      clientKey: line.id,
      ingredient_id: line.ingredient_id,
      amount: String(line.amount),
      unit: line.unit,
      ratio_pct: line.ratio_pct != null ? String(line.ratio_pct) : '',
    })),
  }
}

function parseOptionalNonNeg(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = parseFloat(t.replace(/,/g, ''))
  if (Number.isNaN(n) || n < 0) return null
  return n
}

function buildLineInputs(draft: RecipeDraft): RecipeLineInput[] | string {
  const out: RecipeLineInput[] = []
  for (const line of draft.lines) {
    if (!line.ingredient_id.trim()) {
      return '모든 줄에서 재료를 선택해 주세요.'
    }
    const amount = parseFloat(line.amount.replace(/,/g, ''))
    if (Number.isNaN(amount) || amount < 0) {
      return '사용량은 0 이상의 숫자로 입력해 주세요.'
    }
    let ratio_pct: number | null = null
    if (line.ratio_pct.trim() !== '') {
      const r = parseFloat(line.ratio_pct.replace(/,/g, ''))
      if (Number.isNaN(r) || r < 0) {
        return '배합 비율은 0 이상의 숫자로 입력하거나 비워 두세요.'
      }
      ratio_pct = r
    }
    const unit = line.unit.trim() || 'g'
    out.push({
      ingredient_id: line.ingredient_id,
      amount,
      unit,
      ratio_pct,
    })
  }
  return out
}

export function RecipeFormPage() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const isNew = !recipeId
  const navigate = useNavigate()

  const {
    data: recipe,
    isLoading: recipeLoading,
    isError: recipeError,
    error: recipeErr,
  } = useRecipe(isNew ? undefined : recipeId)

  const { data: ingredients, isLoading: ingLoading } = useIngredients()
  const createMut = useCreateRecipe()
  const updateMut = useUpdateRecipe()

  const store = useRecipeFormStore()
  const [editDraft, setEditDraft] = useState<RecipeDraft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew || !recipe) return
    setEditDraft(recipeToDraft(recipe))
  }, [isNew, recipe])

  const draft: RecipeDraft = isNew
    ? store.draft
    : editDraft ?? emptyRecipeDraft()

  const patchDraft = useCallback(
    (p: Partial<RecipeDraft>) => {
      if (isNew) store.patchDraft(p)
      else setEditDraft((d) => ({ ...(d ?? emptyRecipeDraft()), ...p }))
    },
    [isNew, store],
  )

  const setLine = useCallback(
    (key: string, partial: Partial<RecipeDraft['lines'][number]>) => {
      if (isNew) store.setLine(key, partial)
      else {
        setEditDraft((d) => {
          const base = d ?? emptyRecipeDraft()
          return {
            ...base,
            lines: base.lines.map((l) =>
              l.clientKey === key ? { ...l, ...partial } : l,
            ),
          }
        })
      }
    },
    [isNew, store],
  )

  const addLine = useCallback(() => {
    if (isNew) store.addLine()
    else {
      setEditDraft((d) => {
        const base = d ?? emptyRecipeDraft()
        return {
          ...base,
          lines: [
            ...base.lines,
            {
              clientKey: crypto.randomUUID(),
              ingredient_id: '',
              amount: '',
              unit: 'g',
              ratio_pct: '',
            },
          ],
        }
      })
    }
  }, [isNew, store])

  const removeLine = useCallback(
    (key: string) => {
      if (isNew) store.removeLine(key)
      else {
        setEditDraft((d) => {
          const base = d ?? emptyRecipeDraft()
          return {
            ...base,
            lines: base.lines.filter((l) => l.clientKey !== key),
          }
        })
      }
    },
    [isNew, store],
  )

  function onPickIngredient(clientKey: string, ingredientId: string) {
    const ing = ingredients?.find((i) => i.id === ingredientId)
    setLine(clientKey, {
      ingredient_id: ingredientId,
      unit: ing?.unit ?? 'g',
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const name = draft.name.trim()
    if (!name) {
      setFormError('레시피 이름을 입력해 주세요.')
      return
    }

    const tub_size_g = parseOptionalNonNeg(draft.tub_size_g)
    if (tub_size_g === null && draft.tub_size_g.trim() !== '') {
      setFormError('목표 1통 용량은 숫자로 입력하거나 비워 두세요.')
      return
    }

    const memo = draft.memo.trim() === '' ? null : draft.memo.trim()

    const linesOrErr = buildLineInputs(draft)
    if (typeof linesOrErr === 'string') {
      setFormError(linesOrErr)
      return
    }
    if (linesOrErr.length === 0) {
      setFormError('재료 줄을 한 줄 이상 추가해 주세요.')
      return
    }

    try {
      if (isNew) {
        const row = await createMut.mutateAsync({
          name,
          tub_size_g,
          memo,
          lines: linesOrErr,
        })
        store.resetDraft()
        navigate(`/recipes/${row.id}`, { replace: true })
      } else if (recipeId) {
        await updateMut.mutateAsync({
          id: recipeId,
          name,
          tub_size_g,
          memo,
          lines: linesOrErr,
        })
        navigate(`/recipes/${recipeId}`, { replace: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFormError(formatAuthErrorMessage(msg))
    }
  }

  const waitingEditHydration =
    !isNew && Boolean(recipe) && editDraft === null

  if (
    (!isNew && recipeLoading) ||
    waitingEditHydration
  ) {
    return <AuthLoading />
  }

  if (!isNew && recipeError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">
            레시피를 불러오지 못했습니다
          </CardTitle>
          <CardDescription>
            {recipeErr instanceof Error
              ? formatAuthErrorMessage(recipeErr.message)
              : String(recipeErr)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            to="/recipes"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            목록으로
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={isNew ? '/recipes' : `/recipes/${recipeId}`}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          ← 돌아가기
        </Link>
        {isNew ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => store.resetDraft()}
          >
            입력 초기화
          </Button>
        ) : null}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isNew ? '새 레시피' : '레시피 수정'}
            </CardTitle>
            <CardDescription>
              «재료 관리»에 등록된 재료만 선택할 수 있습니다. 새 레시피 입력은
              브라우저에 임시 저장됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="recipe-name">레시피 이름</Label>
              <Input
                id="recipe-name"
                value={draft.name}
                onChange={(e) => patchDraft({ name: e.target.value })}
                placeholder="예: 피스타치오"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tub-g">목표 1통 용량 (g)</Label>
                <Input
                  id="tub-g"
                  inputMode="decimal"
                  value={draft.tub_size_g}
                  onChange={(e) => patchDraft({ tub_size_g: e.target.value })}
                  placeholder="선택"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recipe-memo">메모 (제조 순서 등)</Label>
              <textarea
                id="recipe-memo"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[88px] w-full rounded-lg border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={draft.memo}
                onChange={(e) => patchDraft({ memo: e.target.value })}
                placeholder="선택 사항"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">재료 배합</CardTitle>
            <CardDescription>
              사용량은 재료 단가와 같은 단위 기준으로 적습니다 (예: g, ml).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingLoading ? (
              <p className="text-sm text-muted-foreground">재료 목록 불러오는 중…</p>
            ) : !ingredients?.length ? (
              <p className="text-sm text-amber-700 dark:text-amber-500">
                등록된 재료가 없습니다. 먼저 «재료 관리»에서 재료를 추가해 주세요.
              </p>
            ) : null}

            <div className="space-y-3">
              {draft.lines.map((line) => (
                <div
                  key={line.clientKey}
                  className="grid gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 sm:grid-cols-12"
                >
                  <div className="grid gap-1.5 sm:col-span-5">
                    <Label className="text-xs">재료</Label>
                    <select
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-lg border px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      value={line.ingredient_id}
                      onChange={(e) =>
                        onPickIngredient(line.clientKey, e.target.value)
                      }
                    >
                      <option value="">선택…</option>
                      {ingredients?.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.name} ({ing.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs">사용량</Label>
                    <Input
                      inputMode="decimal"
                      value={line.amount}
                      onChange={(e) =>
                        setLine(line.clientKey, { amount: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs">단위</Label>
                    <Input
                      value={line.unit}
                      onChange={(e) =>
                        setLine(line.clientKey, { unit: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label className="text-xs">비율 %</Label>
                    <Input
                      inputMode="decimal"
                      value={line.ratio_pct}
                      onChange={(e) =>
                        setLine(line.clientKey, { ratio_pct: e.target.value })
                      }
                      placeholder="선택"
                    />
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => removeLine(line.clientKey)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button type="button" variant="secondary" onClick={addLine}>
              재료 줄 추가
            </Button>
          </CardContent>
        </Card>

        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={
              createMut.isPending ||
              updateMut.isPending ||
              (!isNew && !editDraft)
            }
          >
            {isNew ? '등록' : '저장'}
          </Button>
          <Link
            to={isNew ? '/recipes' : `/recipes/${recipeId}`}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
