import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router-dom'

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
import {
  TASK_RECURRENCE_LABELS,
  TASK_REPORT_TYPE_LABELS,
  WEEKDAY_LABELS,
  describeRecurrence,
  todayYmd,
  tomorrowYmd,
  useCreateStoreTask,
  useDeleteStoreTask,
  useStoreTasks,
  useUpdateStoreTask,
  type StoreTaskInput,
  type StoreTaskRow,
  type TaskCategory,
  type TaskRecurrenceType,
  type TaskReportType,
} from '@/hooks/useStoreTasks'
import {
  useDeleteStoreTaskReport,
  useStoreTaskReports,
  type StoreTaskReportRow,
} from '@/hooks/useStoreTaskReports'
import { useStaffList } from '@/hooks/useStaff'
import {
  useCreateTaskCategory,
  useDeleteTaskCategory,
  useTaskCategories,
  useUpdateTaskCategory,
  type TaskCategoryRow,
} from '@/hooks/useTaskCategories'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { useStore } from '@/hooks/useStore'
import { deleteTaskImages, uploadTaskImage } from '@/lib/imageUpload'
import { isTaskDueOnDate, ymdLocal } from '@/lib/taskRecurrence'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import { cn } from '@/lib/utils'

type FormMode = { type: 'new' } | { type: 'edit'; task: StoreTaskRow } | null
type CategoryFilter = 'all' | TaskCategory

const REPORT_BADGE_CLASS: Record<TaskReportType, string> = {
  check:
    'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
  photo: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
  memo: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
}

/** 기본 시드 코드는 고유 컬러, 사용자 추가 카테고리는 muted fallback */
function categoryBadgeClass(code: string): string {
  switch (code) {
    case 'open':
      return 'bg-primary/12 text-primary ring-primary/25'
    case 'middle':
      return 'bg-blue-500/12 text-blue-700 dark:text-blue-300 ring-blue-500/25'
    case 'close':
      return 'bg-amber-500/12 text-amber-700 dark:text-amber-300 ring-amber-500/25'
    case 'weekly':
      return 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/25'
    case 'monthly':
      return 'bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25'
    case 'other':
      return 'bg-muted text-muted-foreground ring-border/40'
    default:
      return 'bg-slate-500/12 text-slate-700 dark:text-slate-300 ring-slate-500/25'
  }
}

/** 업무 관리 — 외부 wrapper. LNB 하위 메뉴(설정/현황)는 라우트로 분기되어 Outlet에 렌더. */
export function TasksPage() {
  return <Outlet />
}

export function TaskSettingsPage() {
  const { data: store } = useStore()
  const storeId = store?.id ?? null
  const { data: tasks, isLoading } = useStoreTasks()
  const { data: cats } = useTaskCategories()
  const createMut = useCreateStoreTask()
  const updateMut = useUpdateStoreTask()
  const deleteMut = useDeleteStoreTask()

  const [form, setForm] = useState<FormMode>(null)
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [catModalOpen, setCatModalOpen] = useState(false)

  const categoriesList: TaskCategoryRow[] = useMemo(() => cats ?? [], [cats])

  /** code → label 빠른 조회 */
  const labelByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of categoriesList) m.set(c.code, c.label)
    return m
  }, [categoriesList])

  /** 카테고리별 카운트 (전체 + 각 카테고리 동적) */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    for (const cat of categoriesList) c[cat.code] = 0
    for (const t of tasks ?? []) {
      c.all++
      for (const code of t.categories) {
        if (c[code] !== undefined) c[code]++
      }
    }
    return c
  }, [tasks, categoriesList])

  /** 필터 적용된 목록 */
  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    if (filter === 'all') return tasks
    return tasks.filter((t) => t.categories.includes(filter))
  }, [tasks, filter])

  async function handleToggleActive(task: StoreTaskRow) {
    try {
      await updateMut.mutateAsync({ id: task.id, active: !task.active })
    } catch (e) {
      window.alert(getPostgrestMessage(e))
    }
  }

  async function handleDelete(task: StoreTaskRow) {
    if (!window.confirm(`「${task.title}」을(를) 삭제할까요?`)) return
    try {
      await deleteMut.mutateAsync(task.id)
    } catch (e) {
      window.alert(getPostgrestMessage(e))
    }
  }

  const filterChip = (key: CategoryFilter, label: string) => {
    const on = filter === key
    const n = counts[key] ?? 0
    return (
      <button
        key={key}
        type="button"
        onClick={() => setFilter(key)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-150',
          on
            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
            : 'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45 hover:ring-border/40',
        )}
      >
        {label}
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] font-semibold tabular-nums leading-tight',
            on ? 'bg-white/20' : 'bg-muted text-muted-foreground',
          )}
        >
          {n}
        </span>
      </button>
    )
  }

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold tracking-tight">
              업무 설정
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              오픈·미들·마감·주간·월간 업무를 설정합니다. 카테고리·반복주기·보고 방식을 지정.
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCatModalOpen(true)}
            >
              카테고리 관리
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={form?.type === 'new'}
              onClick={() => setForm({ type: 'new' })}
            >
              + 업무 추가
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {/* 필터 chip row — 동적 카테고리 기반 */}
        {(tasks ?? []).length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {filterChip('all', '전체')}
            {categoriesList.map((c) => filterChip(c.code, c.label))}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : (tasks ?? []).length === 0 ? (
          <EmptyState onAdd={() => setForm({ type: 'new' })} />
        ) : filteredTasks.length === 0 ? (
          <p className="rounded-2xl bg-muted/15 p-6 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/25">
            이 카테고리에 등록된 업무가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredTasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                labelByCode={labelByCode}
                onEdit={() => setForm({ type: 'edit', task: t })}
                onToggleActive={() => void handleToggleActive(t)}
                onDelete={() => void handleDelete(t)}
                disabled={updateMut.isPending || deleteMut.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>

      {/* 등록·수정 모달 */}
      <Modal
        open={form !== null}
        title={form?.type === 'edit' ? '업무 수정' : '새 업무 추가'}
        onClose={() => setForm(null)}
      >
        {form?.type === 'new' ? (
          <TaskForm
            mode="new"
            storeId={storeId}
            categories={categoriesList}
            busy={createMut.isPending}
            onSubmit={async (input) => {
              await createMut.mutateAsync(input)
              setForm(null)
            }}
            onCancel={() => setForm(null)}
            onManageCategories={() => setCatModalOpen(true)}
          />
        ) : form?.type === 'edit' ? (
          <TaskForm
            mode="edit"
            initial={form.task}
            storeId={storeId}
            categories={categoriesList}
            busy={updateMut.isPending}
            onSubmit={async (input) => {
              await updateMut.mutateAsync({ id: form.task.id, ...input })
              setForm(null)
            }}
            onCancel={() => setForm(null)}
            onManageCategories={() => setCatModalOpen(true)}
          />
        ) : null}
      </Modal>

      {/* 카테고리 관리 모달 */}
      <Modal
        open={catModalOpen}
        title="카테고리 관리"
        onClose={() => setCatModalOpen(false)}
      >
        <CategoryManager categories={categoriesList} />
      </Modal>
    </Card>
  )
}

/** 단순 포털 모달 — overlay 클릭 또는 ESC로 닫힘. */
function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="닫기"
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border/40">
        <div className="flex shrink-0 items-center justify-between border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            aria-label="닫기"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl bg-muted/15 p-8 text-center shadow-sm ring-1 ring-border/25">
      <svg
        className="mx-auto mb-3 size-10 text-muted-foreground/50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h3" />
      </svg>
      <p className="text-sm font-medium">아직 등록된 업무가 없습니다.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        오픈/미들/마감 등 일상 업무를 추가해 보세요.
      </p>
      <Button type="button" size="sm" className="mt-3" onClick={onAdd}>
        + 첫 업무 추가
      </Button>
    </div>
  )
}

function TaskCard({
  task,
  labelByCode,
  onEdit,
  onToggleActive,
  onDelete,
  disabled,
}: {
  task: StoreTaskRow
  labelByCode: Map<string, string>
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const pillBase =
    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1'
  const { data: urlMap } = useSignedUrls(task.description_images)
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-xl border border-border/40 bg-card p-3 shadow-sm transition-colors',
        !task.active && 'opacity-60',
      )}
    >
      {/* 카테고리 배지들 (다중) */}
      <div className="flex flex-wrap gap-1">
        {task.categories.map((c) => (
          <span key={c} className={cn(pillBase, categoryBadgeClass(c))}>
            {labelByCode.get(c) ?? c}
          </span>
        ))}
        {!task.active ? (
          <span
            className={cn(
              pillBase,
              'bg-destructive/10 text-destructive ring-destructive/30',
            )}
          >
            비활성
          </span>
        ) : null}
      </div>

      {/* 제목·설명 */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{task.title}</p>
        {task.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
      </div>

      {/* 설명 이미지 썸네일 strip (있을 때만) */}
      {task.description_images.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.description_images.map((path) => {
            const url = urlMap?.[path]
            return (
              <div
                key={path}
                className="size-12 overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/30"
              >
                {url ? (
                  <img
                    src={url}
                    alt="설명 이미지"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[9px] text-muted-foreground">
                    …
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* 보고방식·반복주기 */}
      <div className="flex flex-wrap gap-1">
        <span className={cn(pillBase, REPORT_BADGE_CLASS[task.report_type])}>
          {TASK_REPORT_TYPE_LABELS[task.report_type]}
        </span>
        <span
          className={cn(
            pillBase,
            'bg-muted text-muted-foreground ring-border/40',
          )}
        >
          {describeRecurrence(task)}
        </span>
      </div>

      {/* 액션 */}
      <div className="-mx-1 flex items-center justify-end gap-0.5 border-t border-border/30 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={disabled}
          onClick={onToggleActive}
          title={task.active ? '비활성화' : '활성화'}
        >
          {task.active ? '비활성' : '활성'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px]"
          disabled={disabled}
          onClick={onEdit}
        >
          수정
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
          disabled={disabled}
          onClick={onDelete}
        >
          삭제
        </Button>
      </div>
    </div>
  )
}

function TaskForm({
  mode,
  initial,
  storeId,
  categories: availableCategories,
  busy,
  onSubmit,
  onCancel,
  onManageCategories,
}: {
  mode: 'new' | 'edit'
  initial?: StoreTaskRow
  storeId: string | null
  categories: TaskCategoryRow[]
  busy: boolean
  onSubmit: (input: StoreTaskInput) => Promise<void>
  onCancel: () => void
  onManageCategories: () => void
}) {
  const defaultCategory = availableCategories[0]?.code
  const [categories, setCategories] = useState<Set<TaskCategory>>(
    new Set(
      initial?.categories ?? (defaultCategory ? [defaultCategory] : []),
    ),
  )
  /** 이미지 항목 모델 — 화면에 보이는지(`removed`)는 표시 토글, 실제 storage 삭제는 submit/unmount 시 일괄 처리. */
  type ImgItem = {
    kind: 'existing' | 'added'
    path: string
    removed: boolean
  }
  const [imageItems, setImageItems] = useState<ImgItem[]>(
    (initial?.description_images ?? []).map((p) => ({
      kind: 'existing' as const,
      path: p,
      removed: false,
    })),
  )
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 화면에 표시할 이미지 (제거 토글된 항목 제외) */
  const visibleImages = imageItems.filter((i) => !i.removed)
  const { data: urlMap } = useSignedUrls(visibleImages.map((i) => i.path))

  const MAX_IMAGES = 3

  /** Unmount cleanup용 — 항상 최신 state ref */
  const submittedRef = useRef(false)
  const imageItemsRef = useRef<ImgItem[]>(imageItems)
  useEffect(() => {
    imageItemsRef.current = imageItems
  }, [imageItems])

  useEffect(() => {
    return () => {
      // 정상 submit 한 경우는 handleSubmit에서 처리하므로 skip
      if (submittedRef.current) return
      // 취소/모달 닫힘: 이번 폼 세션에서 「추가됐다가 저장 안 된」 이미지 = orphan → 삭제
      const orphans = imageItemsRef.current
        .filter((i) => i.kind === 'added')
        .map((i) => i.path)
      if (orphans.length > 0) {
        void deleteTaskImages(orphans).catch(() => {
          /* best-effort */
        })
      }
    }
  }, [])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 동일 파일 재선택 가능하도록 reset
    if (files.length === 0 || !storeId) return
    setErr(null)
    setUploading(true)
    try {
      const room = MAX_IMAGES - visibleImages.length
      const toUpload = files.slice(0, room)
      const uploaded: ImgItem[] = []
      for (const f of toUpload) {
        const path = await uploadTaskImage(f, storeId)
        uploaded.push({ kind: 'added', path, removed: false })
      }
      setImageItems((prev) => [...prev, ...uploaded])
      if (files.length > room) {
        setErr(
          `최대 ${MAX_IMAGES}장까지 첨부할 수 있어 ${room}장만 추가했습니다.`,
        )
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveImage(path: string) {
    setErr(null)
    setImageItems((prev) =>
      prev.map((i) => (i.path === path ? { ...i, removed: true } : i)),
    )
    // 실제 storage 삭제는 submit 성공 또는 unmount 시 처리
  }
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [reportType, setReportType] = useState<TaskReportType>(
    initial?.report_type ?? 'check',
  )
  const [recurrenceType, setRecurrenceType] = useState<TaskRecurrenceType>(
    initial?.recurrence_type ?? 'daily',
  )
  const [weekDays, setWeekDays] = useState<Set<number>>(
    new Set(initial?.recurrence_days ?? []),
  )
  const [monthDay, setMonthDay] = useState<number>(
    initial?.recurrence_day_of_month ?? 1,
  )
  const [onceDate, setOnceDate] = useState<string>(
    initial?.one_time_date ?? todayYmd(),
  )
  const [active, setActive] = useState<boolean>(initial?.active ?? true)
  const [err, setErr] = useState<string | null>(null)

  function toggleCategory(c: TaskCategory) {
    const next = new Set(categories)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    setCategories(next)
  }

  function toggleWeekDay(d: number) {
    const next = new Set(weekDays)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    setWeekDays(next)
  }

  async function handleSubmit() {
    setErr(null)
    if (categories.size === 0) {
      setErr('카테고리를 1개 이상 선택해 주세요.')
      return
    }
    if (!title.trim()) {
      setErr('업무명을 입력해 주세요.')
      return
    }
    if (recurrenceType === 'weekly' && weekDays.size === 0) {
      setErr('매주 반복할 요일을 1개 이상 선택해 주세요.')
      return
    }
    if (
      recurrenceType === 'monthly' &&
      (monthDay < 1 || monthDay > 31 || !Number.isFinite(monthDay))
    ) {
      setErr('매월 반복할 날짜를 1~31 사이로 입력해 주세요.')
      return
    }
    if (recurrenceType === 'once' && !onceDate) {
      setErr('1회성 업무의 날짜를 선택해 주세요.')
      return
    }
    // 카테고리 정렬 — task_categories.display_order 순
    const orderedCategories = availableCategories
      .map((c) => c.code)
      .filter((c) => categories.has(c))
    // 최종 저장될 이미지 path (제거 안 된 것)
    const finalImagePaths = imageItems
      .filter((i) => !i.removed)
      .map((i) => i.path)
    // 삭제할 path — existing 중 제거된 것 + added인데 제거된 것 (둘 다 storage에서 제거)
    const toDeletePaths = imageItems
      .filter((i) => i.removed)
      .map((i) => i.path)

    try {
      await onSubmit({
        categories: orderedCategories,
        title: title.trim(),
        description: description.trim() || null,
        description_images: finalImagePaths,
        report_type: reportType,
        recurrence_type: recurrenceType,
        recurrence_days:
          recurrenceType === 'weekly' ? [...weekDays].sort() : null,
        recurrence_day_of_month:
          recurrenceType === 'monthly' ? monthDay : null,
        one_time_date: recurrenceType === 'once' ? onceDate : null,
        active,
      })
      // 제출 성공 — unmount cleanup이 「added orphans」 지우지 않도록 마크
      submittedRef.current = true
      // 제거 대상 storage cleanup (best-effort)
      if (toDeletePaths.length > 0) {
        void deleteTaskImages(toDeletePaths).catch(() => {
          /* best-effort */
        })
      }
      return
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  const segmentClass = (on: boolean) =>
    cn(
      'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-all duration-150',
      on
        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
        : 'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45 hover:ring-border/40',
    )

  return (
    <div className="space-y-4">
      {/* 카테고리 (다중) */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground">
            카테고리{' '}
            <span className="text-muted-foreground/60">(중복 선택 가능)</span>
          </Label>
          <button
            type="button"
            onClick={onManageCategories}
            className="text-[11px] font-medium text-primary hover:underline"
          >
            카테고리 관리 →
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableCategories.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">
              등록된 카테고리가 없습니다. 「카테고리 관리」에서 먼저 추가하세요.
            </span>
          ) : (
            availableCategories.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => toggleCategory(c.code)}
                className={segmentClass(categories.has(c.code))}
              >
                {c.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* 업무명 */}
      <div className="grid gap-2">
        <Label htmlFor="task-title">
          업무명 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 복장 단정 / 냉장고 청소"
          autoFocus={mode === 'new'}
        />
      </div>

      {/* 설명 */}
      <div className="grid gap-2">
        <Label htmlFor="task-desc">업무 설명</Label>
        <textarea
          id="task-desc"
          className="min-h-[64px] rounded-xl border border-border/50 bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="명찰 착용 및 복장 청결 유지. 액세서리·향수 사용 금지. 손톱 청결 확인."
        />
      </div>

      {/* 설명 이미지 (최대 3장) */}
      <div className="grid gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          업무 설명 이미지 (선택, 최대 {MAX_IMAGES}장)
        </Label>
        <p className="text-[11px] text-muted-foreground/80">
          직원이 참고할 사진을 첨부해 「복장 예시·청소 위치」 등 작업을 표준화할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          {visibleImages.map(({ path }) => {
            const url = urlMap?.[path]
            return (
              <div
                key={path}
                className="group relative size-20 overflow-hidden rounded-xl border border-border/40 bg-muted/30"
              >
                {url ? (
                  <img
                    src={url}
                    alt="업무 설명 이미지"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                    로딩…
                  </div>
                )}
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="삭제"
                  onClick={() => handleRemoveImage(path)}
                  disabled={busy || uploading}
                >
                  ✕
                </button>
              </div>
            )
          })}
          {visibleImages.length < MAX_IMAGES ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || busy || !storeId}
              className={cn(
                'flex size-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/50 bg-muted/15 text-muted-foreground transition-colors',
                'hover:border-border/70 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {uploading ? (
                <span className="text-[10px]">업로드 중…</span>
              ) : (
                <>
                  <svg
                    className="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="text-[10px]">사진 추가</span>
                </>
              )}
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void handleFileSelect(e)}
        />
      </div>

      {/* 보고 방식 */}
      <div className="grid gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          보고 방식
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {(['check', 'photo', 'memo'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setReportType(t)}
              className={segmentClass(reportType === t)}
            >
              {TASK_REPORT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {reportType === 'photo' ? (
          <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
            ※ 사진 업로드 UI는 다음 단계(Phase 2)에서 추가됩니다. 지금은 타입만 저장됩니다.
          </p>
        ) : null}
      </div>

      {/* 반복 주기 */}
      <div className="grid gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          반복 주기
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {(['daily', 'weekly', 'monthly', 'once'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRecurrenceType(r)}
              className={segmentClass(recurrenceType === r)}
            >
              {TASK_RECURRENCE_LABELS[r]}
            </button>
          ))}
        </div>

        {recurrenceType === 'weekly' ? (
          <div className="flex flex-wrap gap-1.5 px-0.5 pt-1">
            {WEEKDAY_LABELS.map((label, idx) => {
              const on = weekDays.has(idx)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleWeekDay(idx)}
                  className={cn(
                    'size-9 rounded-full text-xs font-medium transition-all duration-150',
                    on
                      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
                      : 'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : null}

        {recurrenceType === 'monthly' ? (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">매월</span>
            <Input
              type="number"
              min={1}
              max={31}
              className="h-9 w-20"
              value={monthDay}
              onChange={(e) => setMonthDay(parseInt(e.target.value || '1', 10))}
            />
            <span className="text-xs text-muted-foreground">일</span>
          </div>
        ) : null}

        {recurrenceType === 'once' ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setOnceDate(todayYmd())}
              className={segmentClass(onceDate === todayYmd())}
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setOnceDate(tomorrowYmd())}
              className={segmentClass(onceDate === tomorrowYmd())}
            >
              내일
            </button>
            <Input
              type="date"
              className="h-9 w-[170px]"
              value={onceDate}
              onChange={(e) => setOnceDate(e.target.value)}
            />
          </div>
        ) : null}
      </div>

      {/* 활성 토글 (수정 모드에서만 노출) */}
      {mode === 'edit' ? (
        <div className="flex items-center justify-between rounded-xl bg-background/60 px-3 py-2 ring-1 ring-border/30">
          <div>
            <p className="text-xs font-medium">활성 상태</p>
            <p className="text-[11px] text-muted-foreground">
              비활성 시 매장 단말에 노출되지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActive(!active)}
            className={cn(
              'inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors',
              active ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'size-5 rounded-full bg-white shadow transition-transform',
                active ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      ) : null}

      {err ? <p className="text-xs text-destructive">{err}</p> : null}

      <div className="flex justify-end gap-2 border-t border-border/35 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void handleSubmit()}
        >
          {busy ? '저장 중…' : mode === 'new' ? '추가' : '저장'}
        </Button>
      </div>
    </div>
  )
}

/** 카테고리 관리 — 모달 안에서 동작. 추가/이름 수정/삭제 */
function CategoryManager({ categories }: { categories: TaskCategoryRow[] }) {
  const createMut = useCreateTaskCategory()
  const updateMut = useUpdateTaskCategory()
  const deleteMut = useDeleteTaskCategory()

  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function handleAdd() {
    setErr(null)
    if (!newLabel.trim()) {
      setErr('카테고리 이름을 입력해 주세요.')
      return
    }
    try {
      await createMut.mutateAsync({ label: newLabel.trim() })
      setNewLabel('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '추가에 실패했습니다.')
    }
  }

  function startEdit(c: TaskCategoryRow) {
    setEditingId(c.id)
    setEditLabel(c.label)
    setErr(null)
  }

  async function saveEdit(id: string) {
    setErr(null)
    if (!editLabel.trim()) {
      setErr('카테고리 이름을 입력해 주세요.')
      return
    }
    try {
      await updateMut.mutateAsync({ id, label: editLabel.trim() })
      setEditingId(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장에 실패했습니다.')
    }
  }

  async function handleDelete(c: TaskCategoryRow) {
    if (!window.confirm(`「${c.label}」 카테고리를 삭제할까요?`)) return
    setErr(null)
    try {
      await deleteMut.mutateAsync({ id: c.id, code: c.code })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        매장에서 사용하는 업무 카테고리를 자유롭게 추가·수정·삭제할 수 있습니다. 카테고리를
        사용하는 업무가 있으면 삭제할 수 없습니다 — 먼저 업무에서 빼주세요.
      </p>

      {/* 추가 */}
      <div className="flex gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="새 카테고리 이름 (예: 특별)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleAdd()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={createMut.isPending || !newLabel.trim()}
          onClick={() => void handleAdd()}
        >
          {createMut.isPending ? '추가 중…' : '추가'}
        </Button>
      </div>

      {/* 목록 */}
      <div className="space-y-1.5">
        {categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            등록된 카테고리가 없습니다.
          </p>
        ) : (
          categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-xl border border-border/40 bg-card px-3 py-2"
            >
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1',
                  categoryBadgeClass(c.code),
                )}
              >
                {c.label}
              </span>
              {editingId === c.id ? (
                <>
                  <Input
                    className="h-8 flex-1"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void saveEdit(c.id)
                      } else if (e.key === 'Escape') {
                        setEditingId(null)
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    disabled={updateMut.isPending}
                    onClick={() => void saveEdit(c.id)}
                  >
                    저장
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setEditingId(null)}
                  >
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">{c.label}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-[11px]"
                    onClick={() => startEdit(c)}
                  >
                    이름 수정
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                    disabled={deleteMut.isPending}
                    onClick={() => void handleDelete(c)}
                  >
                    삭제
                  </Button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  )
}

// ============================================================================
// 「현황」 탭 — 사장님이 날짜별 업무 보고 결과 확인
// ============================================================================

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10))
  return new Date(y, m - 1, d)
}

function fmtHm(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TaskStatusPage() {
  const { data: cats } = useTaskCategories()
  const labelByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of cats ?? []) m.set(c.code, c.label)
    return m
  }, [cats])

  const [selectedDate, setSelectedDate] = useState<string>(ymdLocal(new Date()))
  const { data: tasks } = useStoreTasks()
  const { data: staffList } = useStaffList()
  const { data: reports } = useStoreTaskReports(selectedDate)
  const deleteReportMut = useDeleteStoreTaskReport()

  const dateObj = parseYmdLocal(selectedDate)
  const dueTasks = (tasks ?? []).filter((t) => isTaskDueOnDate(t, dateObj))

  const reportsByTask = new Map<string, StoreTaskReportRow[]>()
  for (const r of reports ?? []) {
    if (!reportsByTask.has(r.task_id)) reportsByTask.set(r.task_id, [])
    reportsByTask.get(r.task_id)!.push(r)
  }
  const staffNameById = new Map<string, string>()
  for (const s of staffList ?? []) staffNameById.set(s.id, s.name)

  function isDone(t: StoreTaskRow): boolean {
    const rs = reportsByTask.get(t.id) ?? []
    if (rs.length === 0) return false
    switch (t.report_type) {
      case 'check':
        return rs.some((r) => r.checked === true)
      case 'photo':
        return rs.some((r) => r.photo_urls.length > 0)
      case 'memo':
        return rs.some((r) => (r.memo ?? '').trim().length > 0)
    }
  }
  const total = dueTasks.length
  const completed = dueTasks.filter((t) => isDone(t)).length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

  function shiftDate(delta: number) {
    const d = parseYmdLocal(selectedDate)
    d.setDate(d.getDate() + delta)
    setSelectedDate(ymdLocal(d))
  }

  async function handleDeleteReport(r: StoreTaskReportRow) {
    const staffName = staffNameById.get(r.staff_id) ?? '?'
    if (
      !window.confirm(
        `${staffName}이(가) ${selectedDate}에 한 보고를 삭제할까요? 첨부 사진이 있으면 같이 제거됩니다.`,
      )
    )
      return
    try {
      await deleteReportMut.mutateAsync({
        id: r.id,
        work_date: r.work_date,
        photo_urls: r.photo_urls,
      })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  const dow = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()]

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
        <CardTitle className="text-lg font-semibold tracking-tight">
          업무 현황
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          날짜별 업무 보고 결과를 확인합니다. 사진·메모·체크 보고가 누구로부터 언제 들어왔는지
          한눈에 — 잘못된 보고는 「삭제」로 정리할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        {/* 날짜 셀렉터 + 진행률 */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted/20 p-3 shadow-sm ring-1 ring-border/25 dark:bg-muted/15">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => shiftDate(-1)}
            >
              ← 어제
            </Button>
            <Input
              type="date"
              className="h-8 w-[150px]"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">({dow})</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => shiftDate(1)}
            >
              내일 →
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[11px]"
              onClick={() => setSelectedDate(ymdLocal(new Date()))}
            >
              오늘
            </Button>
          </div>
          <div className="text-sm tabular-nums">
            진행률 <span className="font-bold">{pct}%</span>{' '}
            <span className="text-muted-foreground">
              ({completed} / {total}건)
            </span>
          </div>
        </div>

        {total === 0 ? (
          <p className="rounded-2xl bg-muted/15 p-6 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-border/25">
            이 날짜에 보고 대상 업무가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {dueTasks.map((t) => (
              <TaskStatusCard
                key={t.id}
                task={t}
                reports={reportsByTask.get(t.id) ?? []}
                completed={isDone(t)}
                labelByCode={labelByCode}
                staffNameById={staffNameById}
                onDelete={handleDeleteReport}
                deletingId={
                  deleteReportMut.isPending ? deleteReportMut.variables?.id : null
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TaskStatusCard({
  task,
  reports,
  completed,
  labelByCode,
  staffNameById,
  onDelete,
  deletingId,
}: {
  task: StoreTaskRow
  reports: StoreTaskReportRow[]
  completed: boolean
  labelByCode: Map<string, string>
  staffNameById: Map<string, string>
  onDelete: (r: StoreTaskReportRow) => void | Promise<void>
  deletingId: string | null | undefined
}) {
  const pillBase =
    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1'
  const allPhotoPaths = reports.flatMap((r) => r.photo_urls)
  const { data: photoUrls } = useSignedUrls(allPhotoPaths)
  const { data: descUrls } = useSignedUrls(task.description_images)

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-xl border border-border/40 bg-card p-3 shadow-sm transition-colors',
        completed && 'bg-emerald-500/[0.04] ring-1 ring-emerald-500/25',
      )}
    >
      {/* 배지 */}
      <div className="flex flex-wrap gap-1">
        {task.categories.map((c) => (
          <span key={c} className={cn(pillBase, categoryBadgeClass(c))}>
            {labelByCode.get(c) ?? c}
          </span>
        ))}
        <span
          className={cn(
            pillBase,
            task.report_type === 'check'
              ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25'
              : task.report_type === 'photo'
                ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25'
                : 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
          )}
        >
          {task.report_type === 'check'
            ? '체크'
            : task.report_type === 'photo'
              ? '사진'
              : '메모'}
        </span>
        {completed ? (
          <span
            className={cn(
              pillBase,
              'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300',
            )}
          >
            ✓ 완료
          </span>
        ) : (
          <span className={cn(pillBase, 'bg-muted text-muted-foreground ring-border/40')}>
            미보고
          </span>
        )}
      </div>

      {/* 제목·설명 */}
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{task.title}</p>
        {task.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
      </div>

      {/* 참고 이미지 */}
      {task.description_images.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.description_images.map((p) => (
            <div
              key={p}
              className="size-10 overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/30"
            >
              {descUrls?.[p] ? (
                <img
                  src={descUrls[p]}
                  alt="참고 이미지"
                  className="size-full object-cover"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex-1" />

      {/* 보고 내역 */}
      <div className="border-t border-border/30 pt-2">
        {reports.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">아직 보고 없음</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div
                key={r.id}
                className="rounded-lg bg-muted/20 px-2 py-1.5 text-xs ring-1 ring-border/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">
                      {staffNameById.get(r.staff_id) ?? '?'}
                    </span>
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      {fmtHm(r.reported_at)}
                    </span>
                    {task.report_type === 'check' && r.checked ? (
                      <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                        ✓
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    aria-label="삭제"
                    disabled={deletingId === r.id}
                    onClick={() => void onDelete(r)}
                    className="shrink-0 rounded text-[10px] text-muted-foreground hover:text-destructive"
                  >
                    삭제
                  </button>
                </div>
                {/* 메모 */}
                {r.memo ? (
                  <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-foreground">
                    {r.memo}
                  </p>
                ) : null}
                {/* 사진 */}
                {r.photo_urls.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.photo_urls.map((p) => (
                      <div
                        key={p}
                        className="size-12 overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/30"
                      >
                        {photoUrls?.[p] ? (
                          <img
                            src={photoUrls[p]}
                            alt="보고 사진"
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-[9px] text-muted-foreground">
                            …
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
