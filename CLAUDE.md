# CLAUDE.md — gelato-os

젤라또 가게 사장님을 위한 **매장 운영 통합 관리 앱** 개발 프로젝트.
레시피·재고·인력·급여를 하나의 앱에서 관리하며, 장기적으로는 타 매장 사장님에게도 제공하는 **SaaS**로 확장 예정.

---

## 현재 프로젝트 상태

| 단계 | 내용 |
|---|---|
| **지금** | Phase 0 — React + Supabase 실서비스 환경 세팅 중 |
| **완료** | 단일 HTML 프로토타입 v1.5 — Feature 1~4 UI·데이터 모델 검증 완료 |

> HTML 프로토타입 파일: `gelato-management-prototype-v1.x.html`
> 실서비스 코드: Phase 0 진행 중 (Vite + React + TS + Tailwind + Shadcn + Supabase 세팅)

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프론트엔드 | React + Vite + TypeScript + Tailwind CSS + Shadcn UI |
| 서버 상태 | TanStack Query (React Query) |
| 로컬 상태 | Zustand |
| 백엔드/DB | Supabase (PostgreSQL + Auth + RLS) |
| 알림/OTP | 카카오워크 Webhook 또는 Twilio SMS (미구현) |
| 배포 | Vercel + GitHub Actions |

---

## 핵심 설계 원칙

1. **`store_id` 모든 테이블에 처음부터** — SaaS 확장 시 DB 재설계 방지. 절대 생략하지 않는다.
2. **RLS(Row Level Security) 처음부터 적용** — `store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())` 패턴을 모든 테이블에 동일하게.
3. **예정 스케줄 ≠ 실제 근무** — `schedule_*` 테이블은 "예정", `attendance` 테이블은 "실적". 급여는 반드시 `attendance` 기준으로 산출.
4. **Feature 1의 `ingredients`가 Feature 2 재고관리로 자연 연결** — 재고 수량 컬럼만 추가하는 구조. 재료 정보를 중복 생성하지 않는다.
5. **원가 계산은 프론트 순수 함수** — DB 집계 없이 `CostCalculator` 컴포넌트에서 `Σ(unit_price × amount)` 직접 계산.

---

## Feature 구현 상태

| Feature       | 내용                              | 상태                           |
| ------------- | ------------------------------- | ---------------------------- |
| **Feature 1** | 레시피 등록 / 원가 계산 / 메뉴판 관리 / 생산 기록 | ✅ HTML 프로토타입 완성 → React 전환 중  |
| **Feature 2** | 재료 & 재고 관리                      | ✅ HTML 프로토타입 v1.5 완성 → React 전환 예정 |
| **Feature 3** | 인력 관리 (직원·근무표·출퇴근·체크리스트)        | 🟡 HTML 프로토타입 v1.5 검증 완료      |
| **Feature 4** | 급여 & 정산                         | 🟡 HTML 프로토타입 v1.5 기본급 산출 구현 |

---

## DB 스키마 요약

> 전체 SQL: `설계-2026-04-29-v1.2.md` 참고

**Feature 1 (실서비스에서 먼저 생성)**
- `stores` → `ingredients` → `recipes` + `recipe_ingredients` → `flavors` → `production_logs`

**Feature 2~4 (확장 시 추가)**
- `inventory`, `inventory_transactions`
- `employment_types`, `staff`, `staff_default_shifts`, `staff_calendar_assignments`
- `schedule_week_slots`, `schedule_week_slot_assignees` (v1.2: 다대다 조인)
- `schedule_month_cells`
- `attendance` (수기 수정 추적 컬럼 포함: `manually_corrected`, `approved_by`, `approved_at`, `correction_note`, `is_baseline`)
- `checklist_items`, `checklist_logs`
- `payroll`

---

## 프론트엔드 구조 (실서비스 기준)

```
src/
├── lib/supabase.ts
├── hooks/
│   ├── useRecipes.ts / useIngredients.ts / useFlavors.ts / useProduction.ts
│   ├── useStaff.ts / useSchedule.ts / useAttendance.ts
├── stores/recipeFormStore.ts      ← Zustand: 레시피 폼 임시 저장
├── components/
│   ├── ui/                        ← Shadcn UI
│   ├── CostCalculator.tsx
│   ├── WeekDragGrid.tsx           ← 드래그 다중선택, 과거 잠금, 단건 삭제
│   └── MonthCalGrid.tsx           ← 달력형, 월별 기본 세팅 버튼
└── pages/
    ├── recipes/ / flavors/ / production/
    ├── inventory/     ← Feature 2 🔒
    ├── staff/         ← Feature 3 🟡
    └── payroll/       ← Feature 4 🟡
```

---

## 개발 순서 (체크리스트.md 기준)

| Phase | 작업 |
|---|---|
| **0** | GitHub 저장소 + Vite/React/TS + Tailwind + Shadcn + Supabase + Vercel |
| **1** | Feature 1 테이블 스키마 마이그레이션 + RLS |
| **2** | Supabase Auth 연동 (이메일/PW, 매장 자동 생성) |
| **3** | `ingredients` CRUD |
| **4** | `recipes` + `recipe_ingredients` + `CostCalculator` |
| **5** | `flavors` 상태 관리 |
| **6** | `production_logs` |
| **7~9** | Feature 2 → Feature 3 → Feature 4 순차 확장 |

---

## 미결 사항 (결정 전 임의 구현 금지)

- [ ] `schedule_month_cells` vs `staff_calendar_assignments` 단일 소스 통합 여부
- [ ] 출퇴근 수기수정 OTP: 카카오워크 Webhook vs Twilio SMS 선택
- [ ] 주휴·야간 수당 수식 근로기준법 시나리오 정교화 (주 단위 15h 집계 등)
- [ ] 급여 명세서 PDF/이미지 생성 방식

---

## 프로젝트 문서 구조

| 파일                                      | 역할                                              |
| --------------------------------------- | ----------------------------------------------- |
| `기획.md`                                 | 핵심 기능 요구사항. 요구사항 변경 발생 시 이 파일에 반영.              |
| `설계-YYYY-MM-DD-vX.X.md`                 | DB 스키마 + 프론트 구조 + 데이터 흐름. 기능 변경 시 새 버전으로 추가 작성. |
| `체크리스트.md`                              | 실서비스 전환 단계별 TODO. Phase 완료 시 체크.                |
| `로그/세션로그-YYYY-MM-DD.md`                 | 당일 세션에서 구현한 내용·발생 문제·해결·다음 할 일 기록. 매 세션마다 생성.   |
| `gelato-management-prototype-vX.X.html` | 단일 파일 HTML 프로토타입. 실서비스 코드 아님.                   |

---

## 세션 로그 작성 규칙

- 파일명: `로그/세션로그-YYYY-MM-DD.md`
- 같은 날 여러 버전 작업 시 파일 하나에 버전별 섹션(`## vX.X 세션`)으로 추가
- 필수 항목: 이번 세션에서 한 일 / 발생한 문제 및 해결 / 다음 세션에서 할 일
- AI에게 새 세션 시작 시 직전 세션 로그를 먼저 읽을 것

---

## 코드 작성 시 주의사항

- `store_id` 없는 테이블 설계·쿼리 작성 금지
- RLS 없이 테이블 생성 금지
- 급여 계산 로직은 `WORK_MONTH`(예정) 기반 절대 금지 — `attendance`(실적) 기준만 사용 (`WORK_MONTH`는 실적 없을 때만 fallback)
- HTML 프로토타입 수정 시 버전 번호 올려서 새 파일로 저장 (기존 파일 덮어쓰기 금지)
- Supabase 쿼리는 항상 TanStack Query hook으로 래핑
