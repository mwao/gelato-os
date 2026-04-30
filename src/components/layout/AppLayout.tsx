import { useEffect, useState, type ReactNode } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-[22px]"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  )
}

function IconDashboard() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 12V6.5a1 1 0 011-1H6a1 1 0 011 1V12M9 12V3.5a1 1 0 011-1h2.5a1 1 0 011 1V12M2 12h12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconRecipe() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect
        x="2"
        y="2"
        width="12"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 6h6M5 9h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconIngredient() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M8 2c2.5 2.8 4 5.4 4 7.8a4 4 0 11-8 0c0-2.4 1.5-5 4-7.8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 9v3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconFlavor() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 5v3l2 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconCost() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 13l3-4 3 2 4-5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconProduction() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect
        x="2"
        y="7"
        width="3"
        height="7"
        rx="1"
        fill="currentColor"
        opacity="0.5"
      />
      <rect
        x="6.5"
        y="4"
        width="3"
        height="10"
        rx="1"
        fill="currentColor"
        opacity="0.7"
      />
      <rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

function IconInventory() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect
        x="1.5"
        y="4"
        width="13"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4 4V3a2 2 0 014 0v1M8 4V3a2 2 0 014 0v1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M5 9h6M5 11.5h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconStaff() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="5.5" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M3.5 14v-1c0-1.5 1.2-2.8 4.5-2.8s4.5 1.3 4.5 2.8v1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconPayroll() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect
        x="2.5"
        y="3"
        width="11"
        height="10"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 6.5h6M5 9h4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug tracking-tight transition-all duration-200',
    isActive
      ? 'bg-primary/[0.11] font-semibold text-primary shadow-sm ring-1 ring-primary/10'
      : 'text-muted-foreground hover:bg-muted/90 hover:text-foreground active:scale-[0.99]',
  )

function NavSoon({
  icon,
  label,
}: {
  icon: ReactNode
  label: string
}) {
  return (
    <div
      className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-muted-foreground/45"
      title="준비 중"
    >
      {icon}
      {label}
    </div>
  )
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/ingredients')) return '재료 관리'
  return '대시보드'
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const title = pageTitle(location.pathname)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    queryClient.removeQueries({ queryKey: ['store'] })
    queryClient.removeQueries({ queryKey: ['ingredients'] })
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-background md:flex-row md:gap-3 md:p-3">
      <button
        type="button"
        aria-hidden={!mobileNavOpen}
        className={cn(
          'fixed inset-0 z-[90] bg-[rgba(26,26,24,0.35)] backdrop-blur-[2px] md:hidden',
          mobileNavOpen ? 'block' : 'hidden',
        )}
        tabIndex={-1}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[100] flex w-[min(280px,86vw)] flex-col overflow-y-auto rounded-r-xl border-y border-r border-border/45 bg-sidebar pb-[max(10px,env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] shadow-[var(--shadow-nav)] transition-transform duration-200 ease-out',
          'md:static md:z-auto md:h-full md:w-[210px] md:min-h-0 md:flex-shrink-0 md:translate-x-0 md:rounded-xl md:border md:border-border/50 md:pb-5 md:pt-0 md:shadow-sm',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-[102%] md:translate-x-0',
        )}
        id="app-sidebar"
      >
        <div className="border-b border-border/45 px-5 pb-5 pt-5 md:rounded-t-xl">
          <Link
            to="/"
            className="block font-heading text-[15px] font-semibold tracking-tight text-foreground"
            onClick={() => setMobileNavOpen(false)}
          >
            Gelato OS
          </Link>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            달콤한 가게 운영
          </p>
        </div>

        <div className="px-5 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
          Feature 1
        </div>
        <NavLink
          to="/"
          end
          className={navLinkClass}
          onClick={() => setMobileNavOpen(false)}
        >
          <IconDashboard />
          대시보드
        </NavLink>
        <NavSoon icon={<IconRecipe />} label="레시피 관리" />
        <NavLink
          to="/ingredients"
          className={navLinkClass}
          onClick={() => setMobileNavOpen(false)}
        >
          <IconIngredient />
          재료 관리
        </NavLink>
        <NavSoon icon={<IconFlavor />} label="메뉴판" />
        <NavSoon icon={<IconCost />} label="원가 계산기" />
        <NavSoon icon={<IconProduction />} label="생산 기록" />

        <div className="mt-2 px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
          Feature 2
        </div>
        <NavSoon icon={<IconInventory />} label="재고 관리" />

        <div className="mt-2 px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
          Feature 3·4
        </div>
        <NavSoon icon={<IconStaff />} label="인력 관리" />
        <NavSoon icon={<IconPayroll />} label="급여 및 정산" />
      </aside>

      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          'm-2.5 mt-2.5 mb-[max(0.5rem,env(safe-area-inset-bottom))] rounded-xl border border-border/50 bg-card/40 shadow-sm',
          'md:m-0 md:bg-card/45',
          'supports-[backdrop-filter]:backdrop-blur-sm',
        )}
      >
        <header
          className={cn(
            'flex h-[52px] shrink-0 items-center gap-2 border-b border-border/40 bg-card/90 px-3',
            'rounded-t-xl supports-[backdrop-filter]:bg-card/70 supports-[backdrop-filter]:backdrop-blur-md supports-[backdrop-filter]:backdrop-saturate-150',
            'md:px-5',
          )}
        >
          <button
            type="button"
            className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted/90 active:scale-95 md:hidden"
            aria-label="메뉴 열기"
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            onClick={() => setMobileNavOpen(true)}
          >
            <MenuIcon />
          </button>
          <h1 className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleSignOut}
          >
            로그아웃
          </Button>
        </header>

        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            'rounded-b-xl',
          )}
        >
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-6 md:px-5 md:pt-7">
            <div className="mx-auto max-w-3xl">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
