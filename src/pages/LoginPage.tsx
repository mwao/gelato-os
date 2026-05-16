import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ACCOUNT_TYPE_LABEL,
  getAccountType,
  homeRouteFor,
  type AccountType,
} from '@/lib/accountType'
import { formatAuthErrorMessage } from '@/lib/authErrors'
import { loginInputToEmail } from '@/lib/storeAccountId'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const from = (location.state as { from?: string } | null)?.from ?? null

  const [tab, setTab] = useState<AccountType>('owner')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // owner: identifier = 이메일. store: identifier = 매장 ID (합성 이메일로 변환)
      const emailForAuth =
        tab === 'store' ? loginInputToEmail(identifier) : identifier.trim()
      const { data, error: signError } = await supabase.auth.signInWithPassword(
        { email: emailForAuth, password },
      )
      if (signError) {
        setError(formatAuthErrorMessage(signError.message))
        return
      }

      const actualType = getAccountType(data.user)
      if (actualType !== tab) {
        // 계정 종류가 탭 선택과 다름 → 로그아웃 + 안내
        await supabase.auth.signOut()
        setError(
          `이 이메일은 「${ACCOUNT_TYPE_LABEL[actualType]} 계정」입니다. 「${ACCOUNT_TYPE_LABEL[tab]} 로그인」 탭이 아니라 「${ACCOUNT_TYPE_LABEL[actualType]} 로그인」 탭으로 다시 시도해 주세요.`,
        )
        return
      }

      await queryClient.invalidateQueries({ queryKey: ['store'] })
      const dest = from ?? homeRouteFor(actualType)
      navigate(dest, { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(formatAuthErrorMessage(msg))
    } finally {
      setSubmitting(false)
    }
  }

  function selectTab(next: AccountType) {
    if (next === tab) return
    setTab(next)
    setError(null)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-25%,rgba(12,92,72,0.11),transparent_58%)]"
        aria-hidden
      />
      <Card className="relative z-[1] w-full max-w-md gap-5">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-xl">Gelato OS · 로그인</CardTitle>
          <CardDescription>
            {tab === 'owner'
              ? '사장님 계정으로 매장 운영·정산 화면에 접속합니다.'
              : '매장 단말에 비치하는 공용 계정으로 출퇴근·업무·근무표를 사용합니다.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-0">
          {/* 계정 종류 탭 (segmented) */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/40 p-1 shadow-inner ring-1 ring-border/30">
            {(['owner', 'store'] as const).map((t) => {
              const on = tab === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectTab(t)}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                    on
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-border/40'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {ACCOUNT_TYPE_LABEL[t]} 로그인
                </button>
              )
            })}
          </div>
        </CardContent>

        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-5 pt-5">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="login-identifier">
                {tab === 'store' ? '매장 ID' : '이메일'}
              </Label>
              <Input
                id="login-identifier"
                type={tab === 'store' ? 'text' : 'email'}
                autoComplete={tab === 'store' ? 'username' : 'email'}
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={tab === 'store' ? '예: gangnam' : ''}
              />
              {tab === 'store' ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  사장님이 「내 매장 정보」에서 발급한 매장 ID를 입력하세요.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="login-password">비밀번호</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p
                className="whitespace-pre-line text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t-0 bg-transparent pb-6 pt-7">
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '처리 중…' : `${ACCOUNT_TYPE_LABEL[tab]} 로그인`}
            </Button>
            {tab === 'owner' ? (
              <p className="text-center text-sm text-muted-foreground">
                계정이 없으신가요?{' '}
                <Link
                  to="/signup"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  사장님 회원가입
                </Link>
              </p>
            ) : (
              <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
                매장 계정은 사장님이 「내 매장 정보」에서 발급합니다.
                <br />
                계정 정보는 사장님께 문의해 주세요.
              </p>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
