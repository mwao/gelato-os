import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateStore } from '@/hooks/useStore'
import { DEFAULT_STORE_NAME } from '@/lib/ensureStore'
import { getPostgrestMessage } from '@/lib/postgresErrors'
import { cn } from '@/lib/utils'

/** 사업자등록번호 표시용 — 「123-45-67890」 */
function formatBusinessNo(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/** 전화번호 표시용 */
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

/**
 * 최초 사장님 가입자만 진입하는 환영 페이지.
 * stores 카운트 ≥ 1 이 되면 OnboardingGate가 / 로 리다이렉트.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const createMut = useCreateStore()

  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [businessNo, setBusinessNo] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function handleAdd() {
    setErr(null)
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
      await createMut.mutateAsync({
        name: name.trim(),
        business_no: bnDigits ? formatBusinessNo(bnDigits) : null,
        owner_name: ownerName.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
      })
      navigate('/', { replace: true })
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  async function handleSkip() {
    setErr(null)
    try {
      await createMut.mutateAsync({ name: DEFAULT_STORE_NAME })
      navigate('/', { replace: true })
    } catch (e) {
      setErr(getPostgrestMessage(e))
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div
        className={cn(
          'w-full max-w-xl rounded-2xl border border-border/45 bg-card shadow-md ring-1 ring-black/[0.04]',
          'dark:ring-white/[0.07]',
        )}
      >
        <div className="border-b border-border/35 bg-gradient-to-b from-muted/30 to-transparent px-6 pb-5 pt-7 text-center">
          <p className="text-3xl">🎉</p>
          <h1 className="mt-2 text-xl font-bold tracking-tight">
            환영합니다, 사장님!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Gelato OS에 오신 것을 환영합니다.
            <br />
            먼저 매장 정보를 입력해 주세요.
            <br />
            <span className="text-[12px] text-muted-foreground/80">
              (입력한 정보는 명세서·세무 서류 등에 사용됩니다)
            </span>
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-2">
            <Label htmlFor="ob-name">
              매장명 / 상호 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ob-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 젤라또 강남점"
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ob-owner-name">대표자명</Label>
              <Input
                id="ob-owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="예: 홍길동"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ob-business-no">사업자등록번호</Label>
              <Input
                id="ob-business-no"
                value={businessNo}
                onChange={(e) => setBusinessNo(formatBusinessNo(e.target.value))}
                inputMode="numeric"
                placeholder="123-45-67890"
                maxLength={12}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ob-address">매장 주소</Label>
            <Input
              id="ob-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예: 서울시 강남구 테헤란로 123, 1층"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ob-phone">매장 연락처</Label>
            <Input
              id="ob-phone"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              inputMode="tel"
              placeholder="02-123-4567"
              maxLength={13}
            />
          </div>

          {err ? <p className="text-xs text-destructive">{err}</p> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border/35 pt-4 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={createMut.isPending}
              onClick={() => void handleSkip()}
            >
              건너뛰고 시작
            </Button>
            <Button
              type="button"
              disabled={createMut.isPending}
              onClick={() => void handleAdd()}
            >
              {createMut.isPending ? '추가 중…' : '매장 추가하기'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
