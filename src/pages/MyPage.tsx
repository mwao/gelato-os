import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
  useCreateStoreAccount,
  useDeleteStoreAccount,
} from '@/hooks/useStoreAccount'
import { useStore, useUpdateStoreInfo } from '@/hooks/useStore'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import {
  emailToDisplayId,
  validateStoreAccountId,
} from '@/lib/storeAccountId'
import { cn } from '@/lib/utils'

/** 사업자등록번호 표시용 포매팅 — 10자리 → 「123-45-67890」 */
function formatBusinessNo(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/** 전화번호 표시용 포매팅 — 자릿수에 따라 「02-...」「031-...」「010-...」 */
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

export function MyPage() {
  const { data: store, isLoading } = useStore()
  const updateMut = useUpdateStoreInfo()

  const [name, setName] = useState('')
  const [businessNo, setBusinessNo] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [savedHint, setSavedHint] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!store) return
    setName(store.name ?? '')
    setBusinessNo(store.business_no ?? '')
    setOwnerName(store.owner_name ?? '')
    setAddress(store.address ?? '')
    setPhone(store.phone ?? '')
  }, [store])

  const dirty =
    !!store &&
    (name !== (store.name ?? '') ||
      businessNo !== (store.business_no ?? '') ||
      ownerName !== (store.owner_name ?? '') ||
      address !== (store.address ?? '') ||
      phone !== (store.phone ?? ''))

  async function handleSave() {
    if (!store) return
    setErr(null)
    setSavedHint(null)
    if (!name.trim()) {
      setErr('매장명을 입력해 주세요.')
      return
    }
    const bnDigits = businessNo.replace(/\D/g, '')
    if (bnDigits && bnDigits.length !== 10) {
      setErr('사업자등록번호는 숫자 10자리입니다.')
      return
    }
    try {
      await updateMut.mutateAsync({
        storeId: store.id,
        name: name.trim(),
        business_no: bnDigits ? formatBusinessNo(bnDigits) : null,
        owner_name: ownerName.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
      })
      setSavedHint('저장됨')
      setTimeout(() => setSavedHint(null), 2000)
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">매장 정보를 불러오는 중…</p>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
        <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
          <CardTitle className="text-lg font-semibold tracking-tight">매장 정보</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            급여 명세서·세금 관련 서류 헤더에 노출되는 매장 기본 정보입니다. 세무사 전달 시
            정확한 사업자등록번호·대표자명이 필요합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="store-name">
                매장명 / 상호 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="store-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 젤라또 강남점"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-owner-name">대표자명</Label>
              <Input
                id="store-owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="예: 홍길동"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-business-no">사업자등록번호</Label>
              <Input
                id="store-business-no"
                value={businessNo}
                onChange={(e) => setBusinessNo(formatBusinessNo(e.target.value))}
                inputMode="numeric"
                placeholder="123-45-67890"
                maxLength={12}
              />
              <p className="text-[11px] text-muted-foreground">
                숫자 10자리. 자동으로 「-」 형식이 입력됩니다.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="store-phone">매장 연락처</Label>
              <Input
                id="store-phone"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                inputMode="tel"
                placeholder="02-123-4567"
                maxLength={13}
              />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="store-address">매장 주소</Label>
              <Input
                id="store-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 서울시 강남구 테헤란로 123, 1층"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/35 pt-4">
            <div className="min-w-0 text-[12px]">
              {err ? (
                <span className="text-destructive">{err}</span>
              ) : savedHint ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ {savedHint}
                </span>
              ) : dirty ? (
                <span className="text-muted-foreground">
                  변경 사항이 있습니다. 「저장」을 눌러 반영하세요.
                </span>
              ) : (
                <span className="text-muted-foreground">변경 사항 없음</span>
              )}
            </div>
            <Button
              type="button"
              disabled={!dirty || updateMut.isPending}
              onClick={() => void handleSave()}
              className={cn('shrink-0')}
            >
              {updateMut.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {store ? <StoreAccountCard storeId={store.id} accountEmail={store.store_account_email} /> : null}

      <Card className="rounded-2xl border-border/45 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.05]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">
            매장 ID
          </CardTitle>
          <CardDescription className="text-xs">
            기술 지원이나 데이터 백업 요청 시 사용됩니다. 일반적으로 신경 쓰지 않아도 됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block rounded-md bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground select-all">
            {store?.id ?? '—'}
          </code>
        </CardContent>
      </Card>
    </div>
  )
}

/** 매장 계정 발급·삭제 카드 — 매장 단말에서 직원 공용 로그인용 */
function StoreAccountCard({
  storeId,
  accountEmail,
}: {
  storeId: string
  accountEmail: string | null
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const deleteMut = useDeleteStoreAccount()
  const [err, setErr] = useState<string | null>(null)

  async function handleDelete() {
    if (
      !window.confirm(
        '매장 계정을 삭제하시겠습니까? 매장 단말은 즉시 로그아웃되며 새 계정 발급이 필요합니다.',
      )
    )
      return
    setErr(null)
    try {
      await deleteMut.mutateAsync({ storeId })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  return (
    <>
      <Card className="rounded-2xl border-border/45 shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.07]">
        <CardHeader className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent pb-4">
          <CardTitle className="text-lg font-semibold tracking-tight">
            매장 계정
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            매장 단말(iPad·PC)에서 직원들이 공용으로 사용하는 로그인 계정입니다. 발급 후
            매장 단말에 한 번 로그인해두면 출퇴근·업무 보고·근무표를 사용할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          {accountEmail ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/[0.06] px-3 py-2.5 ring-1 ring-emerald-500/25">
                <span className="text-base" aria-hidden>
                  🟢
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    매장 계정 발급됨
                  </p>
                  <p className="truncate font-mono text-sm">
                    {emailToDisplayId(accountEmail)}
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                매장 단말은 이 「매장 ID」·비밀번호로 「매장 로그인」 탭에서 접속합니다.
                비밀번호를 잊었다면 계정을 삭제하고 재발급해 주세요.
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deleteMut.isPending}
                  onClick={() => void handleDelete()}
                >
                  {deleteMut.isPending ? '삭제 중…' : '매장 계정 삭제'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2.5 ring-1 ring-border/30">
                <span className="text-base" aria-hidden>
                  ⚪
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    매장 계정 미발급
                  </p>
                  <p className="text-sm text-muted-foreground">
                    매장 단말에서 출퇴근·업무를 사용하려면 매장 계정이 필요합니다.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
                  + 매장 계정 만들기
                </Button>
              </div>
            </>
          )}
          {err ? <p className="text-xs text-destructive">{err}</p> : null}
        </CardContent>
      </Card>

      {modalOpen ? (
        <CreateStoreAccountModal
          storeId={storeId}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </>
  )
}

function CreateStoreAccountModal({
  storeId,
  onClose,
}: {
  storeId: string
  onClose: () => void
}) {
  const createMut = useCreateStoreAccount()
  const [accountId, setAccountId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ accountId: string } | null>(null)

  // ESC + body scroll lock (마운트 시 한 번)
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
    const id = accountId.trim().toLowerCase()
    const idErr = validateStoreAccountId(id)
    if (idErr) {
      setErr(idErr)
      return
    }
    if (password.length < 6) {
      setErr('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    if (password !== confirmPw) {
      setErr('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    try {
      const result = await createMut.mutateAsync({
        storeId,
        accountId: id,
        password,
      })
      setSuccess({ accountId: result.account_id })
    } catch (e) {
      setErr(e instanceof Error ? e.message : '계정 발급에 실패했습니다.')
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
          <h2 className="text-sm font-semibold tracking-tight">매장 계정 만들기</h2>
          <button
            type="button"
            aria-label="닫기"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {success ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-500/[0.06] p-4 ring-1 ring-emerald-500/30">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  ✓ 매장 계정이 발급되었습니다
                </p>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  매장 단말에서 아래 정보로 「매장 로그인」 탭으로 접속하세요.
                </p>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="w-14 shrink-0 text-muted-foreground">매장 ID</span>
                    <code className="break-all rounded bg-background px-2 py-1 font-mono">
                      {success.accountId}
                    </code>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-14 shrink-0 text-muted-foreground">비번</span>
                    <span className="text-muted-foreground">방금 입력한 비밀번호</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                ※ 비밀번호는 다시 확인할 수 없습니다. 분실 시 「매장 계정 삭제 → 재발급」 흐름을
                이용해 주세요.
              </p>
              <div className="flex justify-end">
                <Button type="button" onClick={onClose}>
                  확인
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                매장 단말에서 직원들이 공용으로 로그인할 계정을 만듭니다. 「매장 ID」는 다른
                매장과 겹치지 않게 정해 주세요 (예: 「gangnam」, 「hongdae2호점」).
              </p>

              <div className="grid gap-2">
                <Label htmlFor="sa-account-id">매장 ID</Label>
                <Input
                  id="sa-account-id"
                  value={accountId}
                  onChange={(e) =>
                    setAccountId(e.target.value.toLowerCase())
                  }
                  placeholder="예: gangnam"
                  autoFocus
                  autoComplete="off"
                  inputMode="text"
                  maxLength={20}
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  영문 소문자·숫자·언더바(_)·하이픈(-), 4~20자.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sa-pw">비밀번호</Label>
                <Input
                  id="sa-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="6자 이상"
                  autoComplete="new-password"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="sa-pw-confirm">비밀번호 확인</Label>
                <Input
                  id="sa-pw-confirm"
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="비밀번호 재입력"
                  autoComplete="new-password"
                />
              </div>

              {err ? <p className="text-xs text-destructive">{err}</p> : null}

              <div className="flex justify-end gap-2 border-t border-border/35 pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={createMut.isPending}
                  onClick={onClose}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={createMut.isPending}
                  onClick={() => void handleCreate()}
                >
                  {createMut.isPending ? '발급 중…' : '발급'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
