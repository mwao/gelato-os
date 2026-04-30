import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RecipeLineDraft = {
  clientKey: string
  ingredient_id: string
  amount: string
  unit: string
  ratio_pct: string
}

export type RecipeDraft = {
  name: string
  tub_size_g: string
  memo: string
  lines: RecipeLineDraft[]
}

export function emptyRecipeDraft(): RecipeDraft {
  return {
    name: '',
    tub_size_g: '',
    memo: '',
    lines: [],
  }
}

function newLine(): RecipeLineDraft {
  return {
    clientKey: crypto.randomUUID(),
    ingredient_id: '',
    amount: '',
    unit: 'g',
    ratio_pct: '',
  }
}

type RecipeFormState = {
  draft: RecipeDraft
  setDraft: (d: RecipeDraft) => void
  patchDraft: (p: Partial<RecipeDraft>) => void
  setLine: (key: string, partial: Partial<RecipeLineDraft>) => void
  addLine: () => void
  removeLine: (key: string) => void
  resetDraft: () => void
}

export const useRecipeFormStore = create<RecipeFormState>()(
  persist(
    (set) => ({
      draft: emptyRecipeDraft(),
      setDraft: (draft) => set({ draft }),
      patchDraft: (p) =>
        set((s) => ({ draft: { ...s.draft, ...p } })),
      setLine: (key, partial) =>
        set((s) => ({
          draft: {
            ...s.draft,
            lines: s.draft.lines.map((l) =>
              l.clientKey === key ? { ...l, ...partial } : l,
            ),
          },
        })),
      addLine: () =>
        set((s) => ({
          draft: {
            ...s.draft,
            lines: [...s.draft.lines, newLine()],
          },
        })),
      removeLine: (key) =>
        set((s) => ({
          draft: {
            ...s.draft,
            lines: s.draft.lines.filter((l) => l.clientKey !== key),
          },
        })),
      resetDraft: () => set({ draft: emptyRecipeDraft() }),
    }),
    { name: 'gelato-recipe-form-v1' },
  ),
)
