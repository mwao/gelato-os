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
import { formatAuthErrorMessage } from '@/lib/authErrors'
import { supabase } from '@/lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const from =
    (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signError) {
        setError(formatAuthErrorMessage(signError.message))
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['store'] })
      navigate(from, { replace: true })
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
          <CardTitle className="font-heading text-xl">로그인</CardTitle>
          <CardDescription>
            gelato-os 매장 계정으로 로그인합니다.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <Label htmlFor="login-email">이메일</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
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
          <CardFooter className="flex flex-col gap-4 border-t-0 bg-transparent pb-6 pt-9">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? '처리 중…' : '로그인'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              계정이 없으신가요?{' '}
              <Link
                to="/signup"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                회원가입
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
