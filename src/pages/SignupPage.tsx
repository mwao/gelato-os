import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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
import { formatAuthErrorMessage } from '@/lib/authErrors'
import { supabase } from '@/lib/supabase'

export function SignupPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (password !== passwordConfirm) {
      setError('비밀번호가 서로 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })
      if (signError) {
        setError(formatAuthErrorMessage(signError.message))
        return
      }
      if (data.session) {
        navigate('/', { replace: true })
        return
      }
      const lines = [
        '가입 확인 메일을 보냈습니다. 메일 안의 링크를 누르면 인증이 완료됩니다.',
        '',
        '확인 링크가 localhost라면 같은 PC의 브라우저에서만 열립니다. 휴대폰 메일 앱에서는 보통 열리지 않습니다.',
      ]
      if (import.meta.env.DEV) {
        lines.push(
          '',
          '[로컬 개발] 가입 직후 로그인까지 한 번에 가려면 Supabase 대시보드 → Authentication → Providers → Email에서 Confirm email(이메일 확인)을 끄세요. 그러면 확인 메일 없이 세션이 발급됩니다.',
        )
      }
      lines.push('', '이미 인증했다면 아래에서 로그인하세요.')
      setInfo(lines.join('\n'))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(formatAuthErrorMessage(msg))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-25%,rgba(12,92,72,0.11),transparent_58%)]"
        aria-hidden
      />
      <Card className="relative z-[1] w-full max-w-md gap-5">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-xl">사장님 회원가입</CardTitle>
          <CardDescription>
            매장 운영 앱을 처음 이용하시는 사장님이 사용하는 가입 화면입니다. 매장 단말 공유
            계정은 가입 후 「내 매장 정보」에서 발급합니다.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="signup-email">이메일</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="signup-password">비밀번호</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="signup-password-confirm">비밀번호 확인</Label>
              <Input
                id="signup-password-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
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
            {info ? (
              <p
                className="whitespace-pre-line text-sm text-muted-foreground"
                role="status"
              >
                {info}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t-0 bg-transparent pb-6 pt-9">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? '처리 중…' : '가입하기'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              이미 계정이 있으신가요?{' '}
              <Link
                to="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                로그인
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
