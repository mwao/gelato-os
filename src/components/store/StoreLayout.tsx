import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { useStore } from '@/hooks/useStore'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex shrink-0 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150',
    isActive
      ? 'bg-primary text-primary-foreground shadow-md shadow-primary/15'
      : 'bg-background/80 text-foreground shadow-sm ring-1 ring-border/30 hover:bg-muted/45 hover:ring-border/40',
  )

export function StoreLayout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: store } = useStore()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleSignOut() {
    if (!window.confirm('로그아웃 하시겠습니까?')) return
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  const dow = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()]
  const dateLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} (${dow})`
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-border/40 bg-card/95 px-5 py-3 shadow-sm supports-[backdrop-filter]:bg-card/85 supports-[backdrop-filter]:backdrop-blur-md">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-semibold tracking-tight">
            {store?.name ?? '매장'}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {dateLabel} · {hhmm}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void handleSignOut()}
        >
          로그아웃
        </Button>
      </header>

      <nav className="sticky top-[52px] z-10 flex shrink-0 gap-1.5 overflow-x-auto border-b border-border/35 bg-card/90 px-5 py-2 shadow-sm supports-[backdrop-filter]:bg-card/75 supports-[backdrop-filter]:backdrop-blur">
        <NavLink to="/store/home" end className={navItem}>
          홈
        </NavLink>
        <NavLink to="/store/tasks" className={navItem}>
          업무
        </NavLink>
        <NavLink to="/store/attendance" className={navItem}>
          출퇴근
        </NavLink>
        <NavLink to="/store/schedule" className={navItem}>
          근무표
        </NavLink>
      </nav>

      <main className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
