import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'

const rootEl = document.getElementById('root')

if (!rootEl) {
  throw new Error('Root element #root not found')
}

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url?.trim() || !key?.trim()) {
  createRoot(rootEl).render(
    <StrictMode>
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 py-12 text-foreground">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Supabase 환경 변수가 없습니다
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            프로젝트 루트에 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env</code> 파일을 만들고,{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.env.example</code>을 복사한 뒤{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">VITE_SUPABASE_URL</code>과{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">VITE_SUPABASE_ANON_KEY</code>를
            채운 다음 개발 서버를 다시 시작하세요.
          </p>
        </div>
      </div>
    </StrictMode>,
  )
} else {
  void import('./bootstrap').then(({ renderApp }) => renderApp(rootEl))
}
