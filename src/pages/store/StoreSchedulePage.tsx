import { StaffSchedulePage } from '@/pages/StaffPage'

/**
 * Phase 4-C — 매장 모드 근무표.
 * 기존 사장님용 월간/주간/근무관리 컴포넌트를 그대로 재사용.
 * 매장 계정 RLS는 schedule_month_cells에 RW 권한이 있어 편집·저장이 정상 동작하고,
 * 사장님 전용 영역(staff_default_shifts·shift settings)은 RLS 단에서 차단됨.
 */
export function StoreSchedulePage() {
  return <StaffSchedulePage hideWeek />
}
