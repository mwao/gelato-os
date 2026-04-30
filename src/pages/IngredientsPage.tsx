import { useState } from 'react'

import { AuthLoading } from '@/components/auth/AuthLoading'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAuthErrorMessage } from '@/lib/authErrors'
import {
  useCreateIngredient,
  useDeleteIngredient,
  useIngredients,
  useUpdateIngredient,
  type IngredientRow,
} from '@/hooks/useIngredients'
import { useStore as useStoreQuery } from '@/hooks/useStore'

function parsePrice(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, ''))
  if (Number.isNaN(n) || n < 0) return null
  return n
}

export function IngredientsPage() {
  const { isLoading: storeLoading } = useStoreQuery()
  const {
    data: ingredients,
    isLoading: listLoading,
    isError,
    error,
    refetch,
  } = useIngredients()

  const createMut = useCreateIngredient()
  const updateMut = useUpdateIngredient()
  const deleteMut = useDeleteIngredient()

  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const price = parsePrice(unitPrice)
    if (price === null) {
      setFormError('단가는 0 이상의 숫자로 입력해 주세요.')
      return
    }
    if (!name.trim() || !unit.trim()) {
      setFormError('이름과 단위를 입력해 주세요.')
      return
    }
    try {
      await createMut.mutateAsync({
        name: name.trim(),
        unit: unit.trim(),
        unit_price: price,
      })
      setName('')
      setUnit('')
      setUnitPrice('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setFormError(formatAuthErrorMessage(msg))
    }
  }

  function startEdit(row: IngredientRow) {
    setEditingId(row.id)
    setEditName(row.name)
    setEditUnit(row.unit)
    setEditPrice(String(row.unit_price))
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function saveEdit(id: string) {
    setEditError(null)
    const price = parsePrice(editPrice)
    if (price === null) {
      setEditError('단가는 0 이상의 숫자로 입력해 주세요.')
      return
    }
    if (!editName.trim() || !editUnit.trim()) {
      setEditError('이름과 단위를 입력해 주세요.')
      return
    }
    try {
      await updateMut.mutateAsync({
        id,
        name: editName.trim(),
        unit: editUnit.trim(),
        unit_price: price,
      })
      setEditingId(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setEditError(formatAuthErrorMessage(msg))
    }
  }

  async function handleDelete(row: IngredientRow) {
    if (
      !window.confirm(
        `「${row.name}」 재료를 삭제할까요? 레시피에서 참조 중이면 실패할 수 있습니다.`,
      )
    ) {
      return
    }
    try {
      await deleteMut.mutateAsync(row.id)
    } catch {
      window.alert('삭제에 실패했습니다. 레시피 배합표에서 사용 중인지 확인해 주세요.')
    }
  }

  if (storeLoading || (listLoading && !ingredients)) {
    return <AuthLoading />
  }

  if (isError) {
    return (
      <div className="flex min-h-[40vh] flex-col justify-center py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">
              재료 목록을 불러오지 못했습니다
            </CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : String(error)}
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
    <div className="flex flex-col gap-8">
      <p className="text-sm text-muted-foreground">
        재료 단가를 바꾸면 이후 레시피 원가 계산에 반영됩니다 (Phase 4).
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">재료 추가</CardTitle>
          <CardDescription>
            이름·단위(ml, g 등)·현재 단가(원)를 입력합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ing-name">이름</Label>
                <Input
                  id="ing-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 우유"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ing-unit">단위</Label>
                <Input
                  id="ing-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="예: ml"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ing-price">단가(원)</Label>
                <Input
                  id="ing-price"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="예: 2800"
                  autoComplete="off"
                />
              </div>
            </div>
            {formError ? (
              <p className="whitespace-pre-line text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={createMut.isPending}
              className="w-fit"
            >
              {createMut.isPending ? '추가 중…' : '재료 추가'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록된 재료</CardTitle>
          <CardDescription>
            {(ingredients?.length ?? 0) === 0
              ? '아직 재료가 없습니다. 위 폼에서 추가해 주세요.'
              : `${ingredients?.length}개`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6 pt-0 sm:pt-0">
          {(ingredients?.length ?? 0) > 0 ? (
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/80 text-left text-muted-foreground">
                  <th className="px-4 py-3 text-[11px] font-normal">이름</th>
                  <th className="px-4 py-3 text-[11px] font-normal">단위</th>
                  <th className="px-4 py-3 text-right text-[11px] font-normal">
                    단가(원)
                  </th>
                  <th className="w-[200px] px-4 py-3 text-right text-[11px] font-normal">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {ingredients!.map((row) =>
                  editingId === row.id ? (
                    <tr key={row.id} className="border-b border-border/60 align-top transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-9"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          className="h-9"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          inputMode="decimal"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="h-9 text-right"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveEdit(row.id)}
                            disabled={updateMut.isPending}
                          >
                            저장
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                          >
                            취소
                          </Button>
                        </div>
                        {editError ? (
                          <p className="mt-2 whitespace-pre-line text-left text-xs text-destructive">
                            {editError}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id} className="border-b border-border/60 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.unit}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.unit_price.toLocaleString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(row)}
                          >
                            수정
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(row)}
                            disabled={deleteMut.isPending}
                          >
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
