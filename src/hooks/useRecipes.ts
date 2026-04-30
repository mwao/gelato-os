import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'

export type RecipeRow = {
  id: string
  store_id: string
  name: string
  tub_size_g: number | null
  memo: string | null
  created_at: string
}

export type RecipeIngredientEmbedded = {
  id: string
  name: string
  unit: string
  unit_price: number
}

export type RecipeIngredientLine = {
  id: string
  recipe_id: string
  ingredient_id: string
  amount: number
  unit: string
  ratio_pct: number | null
  ingredient: RecipeIngredientEmbedded | null
}

export type RecipeDetail = RecipeRow & {
  recipe_ingredients: RecipeIngredientLine[]
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function mapIngredientEmbed(raw: unknown): RecipeIngredientEmbedded | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : null
  const name = typeof o.name === 'string' ? o.name : null
  const unit = typeof o.unit === 'string' ? o.unit : ''
  const up = num(o.unit_price)
  if (!id || !name || up === null) return null
  return { id, name, unit, unit_price: up }
}

function mapRecipeRow(raw: Record<string, unknown>): RecipeRow {
  return {
    id: String(raw.id),
    store_id: String(raw.store_id),
    name: String(raw.name),
    tub_size_g: num(raw.tub_size_g),
    memo: raw.memo == null ? null : String(raw.memo),
    created_at: String(raw.created_at),
  }
}

function mapLine(
  raw: Record<string, unknown>,
): RecipeIngredientLine | null {
  const id = typeof raw.id === 'string' ? raw.id : null
  const recipe_id = typeof raw.recipe_id === 'string' ? raw.recipe_id : null
  const ingredient_id =
    typeof raw.ingredient_id === 'string' ? raw.ingredient_id : null
  const amount = num(raw.amount)
  const unit = typeof raw.unit === 'string' ? raw.unit : ''
  if (!id || !recipe_id || !ingredient_id || amount === null || !unit)
    return null
  const ratio_pct = num(raw.ratio_pct)
  let ingRaw = raw.ingredients
  if (Array.isArray(ingRaw)) ingRaw = ingRaw[0]
  const ingredient = mapIngredientEmbed(ingRaw)
  return {
    id,
    recipe_id,
    ingredient_id,
    amount,
    unit,
    ratio_pct,
    ingredient,
  }
}

async function fetchRecipes(storeId: string): Promise<RecipeRow[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, store_id, name, tub_size_g, memo, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (error) throw error
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((r) => mapRecipeRow(r))
}

async function fetchRecipeDetail(
  storeId: string,
  recipeId: string,
): Promise<RecipeDetail> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      `
      id, store_id, name, tub_size_g, memo, created_at,
      recipe_ingredients (
        id,
        recipe_id,
        ingredient_id,
        amount,
        unit,
        ratio_pct,
        ingredients ( id, name, unit, unit_price )
      )
    `,
    )
    .eq('store_id', storeId)
    .eq('id', recipeId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('레시피를 찾을 수 없습니다.')

  const raw = data as Record<string, unknown>
  const base = mapRecipeRow(raw)
  const linesRaw = raw.recipe_ingredients
  const linesArr = Array.isArray(linesRaw) ? linesRaw : []
  const recipe_ingredients = linesArr
    .map((x) => mapLine(x as Record<string, unknown>))
    .filter((x): x is RecipeIngredientLine => x !== null)

  return { ...base, recipe_ingredients }
}

export function useRecipes() {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['recipes', storeId],
    enabled: Boolean(storeId),
    queryFn: () => fetchRecipes(storeId!),
  })
}

export function useRecipe(recipeId: string | undefined) {
  const { data: store } = useStore()
  const storeId = store?.id

  return useQuery({
    queryKey: ['recipe', recipeId],
    enabled: Boolean(storeId && recipeId),
    queryFn: () => fetchRecipeDetail(storeId!, recipeId!),
  })
}

export type RecipeLineInput = {
  ingredient_id: string
  amount: number
  unit: string
  ratio_pct: number | null
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      name: string
      tub_size_g: number | null
      memo: string | null
      lines: RecipeLineInput[]
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      if (input.lines.length === 0)
        throw new Error('재료를 한 줄 이상 추가해 주세요.')

      const { data: recipe, error: recErr } = await supabase
        .from('recipes')
        .insert({
          store_id: storeId,
          name: input.name.trim(),
          tub_size_g: input.tub_size_g,
          memo: input.memo?.trim() || null,
        })
        .select('id, store_id, name, tub_size_g, memo, created_at')
        .single()

      if (recErr) throw recErr

      const recipeRow = mapRecipeRow(recipe as Record<string, unknown>)
      const rows = input.lines.map((line) => ({
        recipe_id: recipeRow.id,
        ingredient_id: line.ingredient_id,
        amount: line.amount,
        unit: line.unit.trim(),
        ratio_pct: line.ratio_pct,
      }))

      const { error: lineErr } = await supabase
        .from('recipe_ingredients')
        .insert(rows)

      if (lineErr) {
        await supabase.from('recipes').delete().eq('id', recipeRow.id)
        throw lineErr
      }

      return recipeRow
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', storeId] })
    },
  })
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (input: {
      id: string
      name: string
      tub_size_g: number | null
      memo: string | null
      lines: RecipeLineInput[]
    }) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      if (input.lines.length === 0)
        throw new Error('재료를 한 줄 이상 추가해 주세요.')

      const { error: upErr } = await supabase
        .from('recipes')
        .update({
          name: input.name.trim(),
          tub_size_g: input.tub_size_g,
          memo: input.memo?.trim() || null,
        })
        .eq('id', input.id)
        .eq('store_id', storeId)

      if (upErr) throw upErr

      const { error: delErr } = await supabase
        .from('recipe_ingredients')
        .delete()
        .eq('recipe_id', input.id)

      if (delErr) throw delErr

      const rows = input.lines.map((line) => ({
        recipe_id: input.id,
        ingredient_id: line.ingredient_id,
        amount: line.amount,
        unit: line.unit.trim(),
        ratio_pct: line.ratio_pct,
      }))

      const { error: insErr } = await supabase
        .from('recipe_ingredients')
        .insert(rows)

      if (insErr) throw insErr

      return input.id
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', storeId] })
      void queryClient.invalidateQueries({
        queryKey: ['recipe', variables.id],
      })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const storeId = store?.id

  return useMutation({
    mutationFn: async (recipeId: string) => {
      if (!storeId) throw new Error('매장 정보가 없습니다.')
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId)
        .eq('store_id', storeId)

      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recipes', storeId] })
    },
  })
}

/** Σ(amount × unit_price) for lines with priced ingredients. */
export function computeTubCost(lines: RecipeIngredientLine[]): number {
  let sum = 0
  for (const line of lines) {
    const price = line.ingredient?.unit_price
    if (price == null) continue
    sum += line.amount * price
  }
  return sum
}
