import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActiveStoreId } from '@/hooks/useActiveStoreId'
import { useCreateStore, useStoreList } from '@/hooks/useStore'
import { DEFAULT_STORE_NAME } from '@/lib/ensureStore'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import { cn } from '@/lib/utils'

export function StoreSelector() {
  const [open, setOpen] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const { data: stores } = useStoreList()
  const [activeId, setActiveId] = useActiveStoreId()
  const wrapRef = useRef<HTMLDivElement>(null)

  const list = stores ?? []
  const active = activeId ? list.find((s) => s.id === activeId) : null
  const effective = active ?? list[0] ?? null

  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 매장 없을 때는 표시 안 함 (Onboarding가 처리)
  if (list.length === 0) return null

  function pick(id: string) {
    setActiveId(id)
    setOpen(false)
  }

  return (
    <>
      <div ref={wrapRef} className="relative px-3 py-2">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-xl border border-border/40 bg-card px-2.5 py-2 text-left shadow-sm transition-colors',
            'hover:bg-muted/40 active:scale-[0.99]',
          )}
        >
          <span className="text-base" aria-hidden>
            🏪
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
            {effective?.name ?? '매장 선택'}
          </span>
          <svg
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform duration-150',
              open ? 'rotate-180' : 'rotate-0',
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open ? (
          <div
            role="listbox"
            className={cn(
              'absolute left-3 right-3 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-border/45 bg-card shadow-lg ring-1 ring-black/[0.05]',
              'animate-in fade-in slide-in-from-top-1 duration-150',
            )}
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {list.map((s) => {
                const on = s.id === effective?.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(s.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors',
                      on
                        ? 'bg-primary/[0.08] font-semibold text-primary'
                        : 'text-foreground hover:bg-muted/45',
                    )}
                  >
                    <span aria-hidden className="w-3 text-[11px]">
                      {on ? '●' : '○'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="border-t border-border/35">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setAddModalOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-primary transition-colors hover:bg-primary/[0.08]"
              >
                <span aria-hidden>+</span>
                매장 추가
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {addModalOpen ? (
        <AddStoreModal
          onClose={() => setAddModalOpen(false)}
          onCreated={(newId) => {
            setActiveId(newId)
            setAddModalOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function formatBusinessNo(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`
  }
  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

function AddStoreModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (newStoreId: string) => void
}) {
  const createMut = useCreateStore()
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [businessNo, setBusinessNo] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
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
  }, [onClose])

  async function handleCreate() {
    setErr(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setErr('매장명을 입력해 주세요.')
      return
    }
    const bnDigits = businessNo.replace(/\D/g, '')
    if (bnDigits && bnDigits.length !== 10) {
      setErr('사업자등록번호는 숫자 10자리입니다.')
      return
    }
    try {
      const created = await createMut.mutateAsync({
        name: trimmed,
        business_no: bnDigits ? formatBusinessNo(bnDigits) : null,
        owner_name: ownerName.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
      })
      onCreated(created.id)
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  async function handleQuickAdd() {
    setErr(null)
    try {
      const created = await createMut.mutateAsync({
        name: DEFAULT_STORE_NAME,
      })
      onCreated(created.id)
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="닫기"
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border/40">
        <div className="flex shrink-0 items-center justify-between border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight">새 매장 추가</h2>
          <button
            type="button"
            aria-label="닫기"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            새 매장을 추가하면 이번 매장이 자동 활성화됩니다. 사업자번호·주소 등은
            나중에 「내 매장 정보」에서 채워도 됩니다.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="add-name">
              매장명 / 상호 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 젤라또 홍대점"
              autoFocus
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="add-owner-name">대표자명</Label>
              <Input
                id="add-owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="홍길동"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-business-no">사업자등록번호</Label>
              <Input
                id="add-business-no"
                value={businessNo}
                onChange={(e) => setBusinessNo(formatBusinessNo(e.target.value))}
                inputMode="numeric"
                placeholder="123-45-67890"
                maxLength={12}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="add-address">매장 주소</Label>
            <Input
              id="add-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="서울시 마포구 ..."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="add-phone">매장 연락처</Label>
            <Input
              id="add-phone"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              inputMode="tel"
              placeholder="02-123-4567"
              maxLength={13}
            />
          </div>

          {err ? <p className="text-xs text-destructive">{err}</p> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border/35 pt-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={createMut.isPending}
              onClick={() => void handleQuickAdd()}
              title="매장명 「내 매장」으로 빠르게 추가"
            >
              빠르게 추가
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={createMut.isPending}
              onClick={() => void handleCreate()}
            >
              {createMut.isPending ? '추가 중…' : '매장 추가'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
