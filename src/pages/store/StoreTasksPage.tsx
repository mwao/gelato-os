import { useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useSignedUrls } from '@/hooks/useSignedUrls'
import { useStaffList, type StaffListRow } from '@/hooks/useStaff'
import { useStore } from '@/hooks/useStore'
import {
  describeRecurrence,
  useStoreTasks,
  type StoreTaskRow,
} from '@/hooks/useStoreTasks'
import {
  useStoreTaskReports,
  useUpsertStoreTaskReport,
  type StoreTaskReportRow,
} from '@/hooks/useStoreTaskReports'
import { useTaskCategories, type TaskCategoryRow } from '@/hooks/useTaskCategories'
import { uploadTaskImage } from '@/lib/imageUpload'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import { isTaskDueOnDate, ymdLocal } from '@/lib/taskRecurrence'
import { cn } from '@/lib/utils'

export function StoreTasksPage() {
  const { data: store } = useStore()
  const storeId = store?.id ?? null
  const { data: tasks, isLoading: tLoading } = useStoreTasks()
  const { data: cats } = useTaskCategories()
  const { data: staffList, isLoading: sLoading } = useStaffList()

  const todayKey = ymdLocal(new Date())
  const { data: reports } = useStoreTaskReports(todayKey)
  const upsertMut = useUpsertStoreTaskReport()

  /** 보고자 (드롭다운) — 미선택 시 첫 직원으로 자동 fallback */
  const [reporterId, setReporterId] = useState<string | null>(null)
  const effectiveReporterId =
    reporterId ?? (staffList && staffList.length > 0 ? staffList[0].id : null)

  /** 오늘 보고 대상 업무만 필터링 */
  const dueTasks = useMemo(() => {
    const d = new Date()
    return (tasks ?? []).filter((t) => isTaskDueOnDate(t, d))
  }, [tasks])

  /** task_id → reports 그룹 */
  const reportsByTask = useMemo(() => {
    const m = new Map<string, StoreTaskReportRow[]>()
    for (const r of reports ?? []) {
      if (!m.has(r.task_id)) m.set(r.task_id, [])
      m.get(r.task_id)!.push(r)
    }
    return m
  }, [reports])

  /** 업무 완료 여부 — 어떤 직원이든 보고 완료 시 완료 */
  function isCompleted(task: StoreTaskRow): boolean {
    const rs = reportsByTask.get(task.id) ?? []
    if (rs.length === 0) return false
    switch (task.report_type) {
      case 'check':
        return rs.some((r) => r.checked === true)
      case 'photo':
        return rs.some((r) => r.photo_urls.length > 0)
      case 'memo':
        return rs.some((r) => (r.memo ?? '').trim().length > 0)
    }
  }

  /** 진행률 */
  const completedCount = dueTasks.filter((t) => isCompleted(t)).length
  const totalCount = dueTasks.length
  const pct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  /** 카테고리 그룹 정렬용 */
  const catsList: TaskCategoryRow[] = useMemo(() => cats ?? [], [cats])
  const labelByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of catsList) m.set(c.code, c.label)
    return m
  }, [catsList])

  /** 카테고리 → 그 카테고리에 속하는 due tasks (정렬: display_order 글로벌) */
  const groupedByCategory = useMemo(() => {
    const m = new Map<string, StoreTaskRow[]>()
    for (const cat of catsList) m.set(cat.code, [])
    const orphan: StoreTaskRow[] = []
    for (const t of dueTasks) {
      let placed = false
      for (const code of t.categories) {
        if (m.has(code)) {
          m.get(code)!.push(t)
          placed = true
          break // 그룹 표시 시 첫 카테고리 그룹에만 넣음 (중복 노출 방지)
        }
      }
      if (!placed) orphan.push(t)
    }
    return { byCat: m, orphan }
  }, [dueTasks, catsList])

  const reporter: StaffListRow | null =
    (staffList ?? []).find((s) => s.id === effectiveReporterId) ?? null

  return (
    <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
      <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">
              오늘 업무
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {totalCount === 0
                ? '오늘 보고할 업무가 없습니다.'
                : `진행률 ${pct}% — 완료 ${completedCount} / 전체 ${totalCount}건`}
            </CardDescription>
          </div>
          {/* 보고자 드롭다운 */}
          <div className="flex items-center gap-2">
            <Label htmlFor="reporter-select" className="text-xs">
              보고자
            </Label>
            <select
              id="reporter-select"
              className="h-9 rounded-xl border border-border/50 bg-background px-2.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              value={effectiveReporterId ?? ''}
              onChange={(e) => setReporterId(e.target.value || null)}
              disabled={sLoading}
            >
              <option value="" disabled>
                — 선택 —
              </option>
              {(staffList ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* 진행률 바 */}
        {totalCount > 0 ? (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {tLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : totalCount === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            {catsList.map((cat) => {
              const list = groupedByCategory.byCat.get(cat.code) ?? []
              if (list.length === 0) return null
              return (
                <CategorySection
                  key={cat.code}
                  label={cat.label}
                  count={list.length}
                  tasks={list}
                  reportsByTask={reportsByTask}
                  reporter={reporter}
                  storeId={storeId}
                  todayKey={todayKey}
                  upsertBusy={upsertMut.isPending}
                  onUpsert={(input) => upsertMut.mutateAsync(input)}
                  isCompleted={isCompleted}
                  labelByCode={labelByCode}
                />
              )
            })}
            {groupedByCategory.orphan.length > 0 ? (
              <CategorySection
                label="기타 (분류 없음)"
                count={groupedByCategory.orphan.length}
                tasks={groupedByCategory.orphan}
                reportsByTask={reportsByTask}
                reporter={reporter}
                storeId={storeId}
                todayKey={todayKey}
                upsertBusy={upsertMut.isPending}
                onUpsert={(input) => upsertMut.mutateAsync(input)}
                isCompleted={isCompleted}
                labelByCode={labelByCode}
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl bg-muted/15 p-8 text-center shadow-sm ring-1 ring-border/25">
      <p className="text-sm font-medium">오늘 보고할 업무가 없습니다.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        업무 추가는 사장님이 「업무 관리」 화면에서 할 수 있습니다.
      </p>
    </div>
  )
}

function CategorySection({
  label,
  count,
  tasks,
  reportsByTask,
  reporter,
  storeId,
  todayKey,
  upsertBusy,
  onUpsert,
  isCompleted,
  labelByCode,
}: {
  label: string
  count: number
  tasks: StoreTaskRow[]
  reportsByTask: Map<string, StoreTaskReportRow[]>
  reporter: StaffListRow | null
  storeId: string | null
  todayKey: string
  upsertBusy: boolean
  onUpsert: (input: {
    task_id: string
    staff_id: string
    work_date: string
    checked?: boolean | null
    memo?: string | null
    photo_urls?: string[]
  }) => Promise<void>
  isCompleted: (task: StoreTaskRow) => boolean
  labelByCode: Map<string, string>
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 px-0.5">
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {count}건
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
        {tasks.map((t) => (
          <TaskReportRow
            key={t.id}
            task={t}
            reports={reportsByTask.get(t.id) ?? []}
            reporter={reporter}
            storeId={storeId}
            todayKey={todayKey}
            completed={isCompleted(t)}
            upsertBusy={upsertBusy}
            onUpsert={onUpsert}
            labelByCode={labelByCode}
          />
        ))}
      </div>
    </section>
  )
}

const REPORT_BADGE: Record<string, string> = {
  check: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
  photo: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25',
  memo: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 ring-violet-500/25',
}
const REPORT_LABEL: Record<string, string> = {
  check: '체크',
  photo: '사진',
  memo: '메모',
}

function TaskReportRow({
  task,
  reports,
  reporter,
  storeId,
  todayKey,
  completed,
  upsertBusy,
  onUpsert,
  labelByCode,
}: {
  task: StoreTaskRow
  reports: StoreTaskReportRow[]
  reporter: StaffListRow | null
  storeId: string | null
  todayKey: string
  completed: boolean
  upsertBusy: boolean
  onUpsert: (input: {
    task_id: string
    staff_id: string
    work_date: string
    checked?: boolean | null
    memo?: string | null
    photo_urls?: string[]
  }) => Promise<void>
  labelByCode: Map<string, string>
}) {
  const [expanded, setExpanded] = useState(false)
  const [memoText, setMemoText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 설명 이미지 signed URLs (참고용 — task.description_images)
  const { data: descUrls } = useSignedUrls(task.description_images)

  // 완료된 보고 (최근) — 가장 최근 보고를 대표 표시
  const lastReport = reports[reports.length - 1] ?? null
  // 보고된 사진 path들 합치기
  const reportedPhotos = reports.flatMap((r) => r.photo_urls)
  const { data: reportedUrls } = useSignedUrls(reportedPhotos)

  const reporterMissing = !reporter || !storeId
  const pillBase =
    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ring-1'

  async function handleCheck() {
    if (reporterMissing) {
      setErr('보고자를 먼저 선택해 주세요.')
      return
    }
    setErr(null)
    try {
      await onUpsert({
        task_id: task.id,
        staff_id: reporter!.id,
        work_date: todayKey,
        checked: true,
      })
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  async function handleSaveMemo() {
    if (reporterMissing) {
      setErr('보고자를 먼저 선택해 주세요.')
      return
    }
    if (!memoText.trim()) {
      setErr('메모를 입력해 주세요.')
      return
    }
    setErr(null)
    try {
      await onUpsert({
        task_id: task.id,
        staff_id: reporter!.id,
        work_date: todayKey,
        memo: memoText.trim(),
      })
      setMemoText('')
      setExpanded(false)
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    if (reporterMissing) {
      setErr('보고자를 먼저 선택해 주세요.')
      return
    }
    setErr(null)
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const f of files.slice(0, 3)) {
        const path = await uploadTaskImage(f, storeId!)
        uploaded.push(path)
      }
      // 기존 보고에 추가 또는 새로 생성
      const existing =
        reports.find((r) => r.staff_id === reporter!.id) ?? null
      const merged = [...(existing?.photo_urls ?? []), ...uploaded].slice(0, 6)
      await onUpsert({
        task_id: task.id,
        staff_id: reporter!.id,
        work_date: todayKey,
        photo_urls: merged,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-2 rounded-xl border border-border/40 bg-card p-3 shadow-sm transition-colors',
        completed && 'bg-emerald-500/[0.04] ring-1 ring-emerald-500/25',
      )}
    >
      {/* 배지 row */}
      <div className="flex flex-wrap items-center gap-1">
        {task.categories.map((c) => (
          <span
            key={c}
            className={cn(
              pillBase,
              'bg-muted text-muted-foreground ring-border/40',
            )}
          >
            {labelByCode.get(c) ?? c}
          </span>
        ))}
        <span className={cn(pillBase, REPORT_BADGE[task.report_type])}>
          {REPORT_LABEL[task.report_type]}
        </span>
        <span
          className={cn(
            pillBase,
            'bg-muted text-muted-foreground ring-border/40',
          )}
        >
          {describeRecurrence(task)}
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
        ) : null}
      </div>

      {/* 제목·설명 — 그리드 셀이 늘어남에 따라 자동 wrap */}
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight">{task.title}</p>
        {task.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {task.description}
          </p>
        ) : null}
      </div>

      {/* 참고 이미지 (사장님이 task에 등록한 설명 이미지) */}
      {task.description_images.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {task.description_images.map((p) => (
            <div
              key={p}
              className="size-12 overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/30"
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

      {/* spacer — 액션을 카드 하단으로 밀어 카드 높이 통일감 */}
      <div className="flex-1" />

      {/* 액션 (보고 방식별) — 풀폭 버튼 */}
      <div className="border-t border-border/30 pt-2">
        {task.report_type === 'check' ? (
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={completed || upsertBusy || reporterMissing}
            onClick={() => void handleCheck()}
          >
            {completed ? '✓ 완료' : '체크하기'}
          </Button>
        ) : null}
        {task.report_type === 'memo' ? (
          <Button
            type="button"
            size="sm"
            variant={expanded ? 'outline' : 'default'}
            className="w-full"
            disabled={upsertBusy || reporterMissing}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '닫기' : completed ? '메모 추가' : '메모 작성'}
          </Button>
        ) : null}
        {task.report_type === 'photo' ? (
          <>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={uploading || upsertBusy || reporterMissing}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? '업로드 중…' : '사진 추가'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void handlePhotoSelect(e)}
            />
          </>
        ) : null}
      </div>

      {/* 메모 입력 (expanded) */}
      {expanded && task.report_type === 'memo' ? (
        <div className="mt-3 space-y-2 border-t border-border/30 pt-3">
          <textarea
            className="min-h-[64px] w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            value={memoText}
            onChange={(e) => setMemoText(e.target.value)}
            placeholder="예: 오늘 매장 예약 컨택 우선으로 완료. 추가 매대 정리는 내일."
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpanded(false)
                setMemoText('')
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={upsertBusy || !memoText.trim()}
              onClick={() => void handleSaveMemo()}
            >
              저장
            </Button>
          </div>
        </div>
      ) : null}

      {/* 보고된 사진 strip */}
      {task.report_type === 'photo' && reportedPhotos.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/30 pt-3">
          {reportedPhotos.map((p) => (
            <div
              key={p}
              className="size-16 overflow-hidden rounded-md bg-muted/30 ring-1 ring-border/30"
            >
              {reportedUrls?.[p] ? (
                <img
                  src={reportedUrls[p]}
                  alt="보고 이미지"
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

      {/* 보고된 메모들 */}
      {task.report_type === 'memo' && reports.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-border/30 pt-3">
          {reports.map((r) =>
            r.memo ? (
              <div
                key={r.id}
                className="rounded-md bg-muted/30 px-2 py-1.5 text-xs text-foreground"
              >
                <span className="font-semibold">
                  {r.staff_id === reporter?.id ? '나' : '동료'}
                </span>
                <span className="ml-1.5 text-muted-foreground">
                  {r.reported_at.slice(11, 16)}
                </span>
                <p className="mt-0.5 whitespace-pre-line">{r.memo}</p>
              </div>
            ) : null,
          )}
        </div>
      ) : null}

      {/* 마지막 보고자 표시 (체크 타입만 간단히) */}
      {task.report_type === 'check' && lastReport?.checked ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          마지막 보고 {lastReport.reported_at.slice(11, 16)}
        </p>
      ) : null}

      {err ? <p className="mt-2 text-xs text-destructive">{err}</p> : null}
    </div>
  )
}
