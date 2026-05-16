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
import { StoreSelector } from '@/components/layout/StoreSelector'
import { useStore } from '@/hooks/useStore'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const LNB_COLLAPSED_KEY = 'gelato-os:lnb-collapsed'

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

/** PC LNB 접기 — 로고 행 오른쪽 */
function IconSidebarCollapse() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M11 19l-7-7 7-7M21 19l-7-7 7-7" />
    </svg>
  )
}

/** PC LNB 접힘 시 메인 위 펼치기 */
function IconSidebarExpand() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden
    >
      <path d="M4 19l7-7-7-7M14 19l7-7-7-7" />
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

function IconTasks() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 5.5l1.2 1.2L8.5 4.5M5 9l1.2 1.2L8.5 8M10.5 6.5h.5M10.5 10h.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconStore() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 6l1.5-3h9L14 6M2 6v7a1 1 0 001 1h10a1 1 0 001-1V6M2 6h12M6 14V9h4v5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v10a1 1 0 001 1h6a1 1 0 001-1v-1M7 8h8m0 0l-2.5-2.5M15 8l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
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

/** 2뎁스(서브 메뉴) 링크 — 부모 아이콘 폭만큼 들여쓰기, 활성 시 좌측에 작은 인디케이터. */
const navSubLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex w-full items-center gap-2 rounded-md py-1.5 pl-9 pr-3 text-left text-[12.5px] leading-snug tracking-tight transition-colors duration-200',
    'before:absolute before:left-[22px] before:top-1/2 before:h-1 before:w-1 before:-translate-y-1/2 before:rounded-full',
    isActive
      ? 'font-medium text-primary before:bg-primary'
      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground before:bg-border',
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
  if (pathname === '/recipes/new') return '레시피 등록'
  if (/^\/recipes\/[^/]+\/edit$/.test(pathname)) return '레시피 수정'
  if (/^\/recipes\/[^/]+$/.test(pathname)) return '레시피 상세'
  if (pathname.startsWith('/recipes')) return '레시피 관리'
  if (pathname.startsWith('/ingredients')) return '재료 관리'
  if (pathname.startsWith('/staff/profile')) return '인력 관리 · 직원 프로필'
  if (pathname.startsWith('/staff/schedule')) return '인력 관리 · 근무표'
  if (pathname.startsWith('/staff/attendance')) return '인력 관리 · 출퇴근'
  if (pathname.startsWith('/staff/checklist')) return '인력 관리 · 체크리스트'
  if (pathname.startsWith('/staff')) return '인력 관리'
  if (pathname.startsWith('/payroll')) return '급여 & 정산'
  if (pathname.startsWith('/tasks/settings')) return '업무 관리 · 설정'
  if (pathname.startsWith('/tasks/status')) return '업무 관리 · 현황'
  if (pathname.startsWith('/tasks')) return '업무 관리'
  if (pathname.startsWith('/my')) return '내 매장 정보'
  if (pathname.startsWith('/onboarding')) return '환영합니다'
  return '대시보드'
}

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { data: activeStore } = useStore()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(LNB_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  const title = pageTitle(location.pathname)

  useEffect(() => {
    try {
      window.localStorage.setItem(LNB_COLLAPSED_KEY, desktopNavCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [desktopNavCollapsed])

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
    queryClient.removeQueries({ queryKey: ['recipes'] })
    queryClient.removeQueries({ queryKey: ['recipe'] })
    queryClient.removeQueries({ queryKey: ['employmentTypes'] })
    queryClient.removeQueries({ queryKey: ['staff'] })
    queryClient.removeQueries({ queryKey: ['weekSchedule'] })
    queryClient.removeQueries({ queryKey: ['monthSchedule'] })
    queryClient.removeQueries({ queryKey: ['attendance'] })
    queryClient.removeQueries({ queryKey: ['checklistItems'] })
    queryClient.removeQueries({ queryKey: ['checklistLogsToday'] })
    queryClient.removeQueries({ queryKey: ['staffCalendar'] })
    queryClient.removeQueries({ queryKey: ['payroll'] })
    queryClient.removeQueries({ queryKey: ['attendanceWorkSummary'] })
    queryClient.removeQueries({ queryKey: ['attendancePeriodDetail'] })
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
          'md:static md:z-auto md:h-full md:min-h-0 md:flex-shrink-0 md:translate-x-0 md:rounded-xl md:border md:border-border/50 md:pt-0 md:pb-5 md:shadow-sm',
          'md:transition-[width,min-width,max-width,opacity,border-color] md:duration-200 md:ease-out',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-[102%]',
          'md:translate-x-0',
          desktopNavCollapsed
            ? 'md:w-0 md:min-w-0 md:max-w-0 md:overflow-hidden md:border-transparent md:p-0 md:opacity-0 md:shadow-none md:pointer-events-none'
            : 'md:w-[210px]',
        )}
        id="app-sidebar"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border/45 px-5 pb-5 pt-5 md:rounded-t-xl">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
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
            <button
              type="button"
              className="hidden size-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-sidebar-accent/80 active:scale-95 md:inline-flex"
              aria-label="메뉴 접기"
              aria-expanded={!desktopNavCollapsed}
              aria-controls="app-sidebar"
              title="메뉴 접기"
              onClick={() => setDesktopNavCollapsed(true)}
            >
              <IconSidebarCollapse />
            </button>
          </div>
        </div>

        <div className="px-2 pt-3">
          <NavLink
            to="/"
            end
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconDashboard />
            대시보드
          </NavLink>
        </div>

        <hr className="mx-5 my-3 border-t border-border/40" />

        <div className="px-2">
          <NavLink
            to="/staff"
            end
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconStaff />
            인력 관리
          </NavLink>
          <div className="mt-0.5 mb-1 flex flex-col gap-0.5">
            <NavLink
              to="/staff/profile"
              className={navSubLinkClass}
              onClick={() => setMobileNavOpen(false)}
            >
              직원 프로필
            </NavLink>
            <NavLink
              to="/staff/schedule"
              className={navSubLinkClass}
              onClick={() => setMobileNavOpen(false)}
            >
              근무표
            </NavLink>
            <NavLink
              to="/staff/attendance"
              className={navSubLinkClass}
              onClick={() => setMobileNavOpen(false)}
            >
              출퇴근
            </NavLink>
            <NavLink
              to="/staff/checklist"
              className={navSubLinkClass}
              onClick={() => setMobileNavOpen(false)}
            >
              체크리스트
            </NavLink>
          </div>
          <NavLink
            to="/tasks"
            end
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconTasks />
            업무 관리
          </NavLink>
          <div className="mt-0.5 mb-1 flex flex-col gap-0.5">
            <NavLink
              to="/tasks/settings"
              className={navSubLinkClass}
              onClick={() => setMobileNavOpen(false)}
            >
              업무 설정
            </NavLink>
            <NavLink
              to="/tasks/status"
              className={navSubLinkClass}
              onClick={() => setMobileNavOpen(false)}
            >
              업무 현황
            </NavLink>
          </div>
          <NavLink
            to="/payroll"
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconPayroll />
            급여 & 정산
          </NavLink>
        </div>

        <hr className="mx-5 my-3 border-t border-border/40" />

        <div className="px-2">
          <NavLink
            to="/recipes"
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconRecipe />
            레시피 관리
          </NavLink>
          <NavLink
            to="/ingredients"
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconIngredient />
            재료 관리
          </NavLink>
        </div>

        <hr className="mx-5 my-3 border-t border-border/40" />

        <div className="px-2">
          <NavSoon icon={<IconFlavor />} label="메뉴판" />
          <NavSoon icon={<IconCost />} label="원가 계산기" />
          <NavSoon icon={<IconProduction />} label="생산 기록" />
          <NavSoon icon={<IconInventory />} label="재고 관리" />
        </div>

        <hr className="mx-5 my-3 border-t border-border/40" />

        <div className="px-2 pb-3">
          <NavLink
            to="/my"
            className={navLinkClass}
            onClick={() => setMobileNavOpen(false)}
          >
            <IconStore />
            내 매장 정보
          </NavLink>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] leading-snug tracking-tight transition-all duration-200',
              'text-muted-foreground hover:bg-muted/90 hover:text-foreground active:scale-[0.99]',
            )}
            onClick={() => {
              setMobileNavOpen(false)
              void handleSignOut()
            }}
          >
            <IconLogout />
            로그아웃
          </button>
        </div>

        <hr className="mx-5 my-3 border-t border-border/40" />

        {/* 매장 셀렉터 — LNB 맨 하단 */}
        <StoreSelector />
        </div>
      </aside>

      {desktopNavCollapsed ? (
        <button
          type="button"
          className="fixed left-[max(0px,env(safe-area-inset-left))] top-[calc(0.75rem+52px)] z-[120] hidden h-10 w-10 items-center justify-center rounded-r-md border border-border/50 border-l-0 bg-foreground text-background shadow-lg ring-1 ring-black/10 transition hover:bg-foreground/90 active:scale-95 md:flex"
          aria-label="메뉴 펼치기"
          aria-expanded={false}
          aria-controls="app-sidebar"
          title="메뉴 펼치기"
          onClick={() => setDesktopNavCollapsed(false)}
        >
          <IconSidebarExpand />
        </button>
      ) : null}

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
          {activeStore?.name ? (
            <div
              className={cn(
                'hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 ring-1 ring-emerald-500/30 sm:inline-flex',
                'dark:bg-emerald-500/20',
              )}
              title="현재 활성 매장"
            >
              <span aria-hidden className="text-sm">
                🏪
              </span>
              <span className="max-w-[180px] truncate text-[13px] font-semibold text-emerald-800 dark:text-emerald-200">
                {activeStore.name}
              </span>
            </div>
          ) : null}
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
            <div className="mx-auto w-full md:max-w-3xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
