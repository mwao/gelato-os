-- Feature 5: 직원·알바 급여 모드 분리
-- 실행 순서: feature4_payroll.sql 이후
-- 변경 범위:
--   1. employment_types: pay_mode, monthly_off_days 추가
--   2. staff: base_salary 추가
--   3. staff_shift_overrides: 신규 테이블 (알바 개인별 시프트 시간)
--   4. payroll: pay_mode, bonus, off_days_* 추가
-- RLS 패턴: store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())

-- =============================================================
-- 1. employment_types: 급여 모드 플래그
-- =============================================================

ALTER TABLE employment_types
  ADD COLUMN IF NOT EXISTS pay_mode text NOT NULL DEFAULT 'hourly'
    CHECK (pay_mode IN ('hourly','salary'));

ALTER TABLE employment_types
  ADD COLUMN IF NOT EXISTS monthly_off_days int;

COMMENT ON COLUMN employment_types.pay_mode IS
  'hourly = 시급제(알바), salary = 월급제(직원·매니저)';
COMMENT ON COLUMN employment_types.monthly_off_days IS
  'salary일 때 의무 휴무일수 (보통 8). hourly에선 NULL';

-- =============================================================
-- 2. staff: 직원 전용 기본급
-- =============================================================

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS base_salary numeric;

COMMENT ON COLUMN staff.base_salary IS
  'salary 모드에서만 사용. hourly 모드는 hourly_rate 사용';
COMMENT ON COLUMN staff.hourly_rate IS
  'hourly 모드에서만 사용. salary 모드는 base_salary 사용';

-- =============================================================
-- 3. staff_shift_overrides: 알바 개인별 시프트 시간
-- =============================================================
-- 매장 기본값(stores.shift_*_start/end)을 사용하지 않고 개인별로 다르게 둘 때 사용.
-- (staff_id, shift) UNIQUE → 한 사람의 한 시프트는 정확히 한 시간대.
-- 행이 없으면 매장 기본값 폴백 (프론트의 getShiftSlotsForStaff 헬퍼).

CREATE TABLE IF NOT EXISTS staff_shift_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shift       text NOT NULL CHECK (shift IN ('open','middle','close')),
  start_time  text NOT NULL,                   -- HH:MM (stores.shift_*_start와 동일 포맷)
  end_time    text NOT NULL,                   -- HH:MM
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CHECK (end_time   ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CHECK (end_time > start_time),
  UNIQUE (staff_id, shift)
);

COMMENT ON TABLE staff_shift_overrides IS
  '알바 개인별 오픈/미들/마감 시간 오버라이드. 행이 없으면 stores.shift_*_start/end 폴백';

ALTER TABLE staff_shift_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store owner full access" ON staff_shift_overrides
  USING  (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- =============================================================
-- 4. payroll: 상여금·휴무 추적 + 산정 당시 모드 스냅샷
-- =============================================================

ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS pay_mode text
    CHECK (pay_mode IN ('hourly','salary'));

ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS bonus numeric NOT NULL DEFAULT 0;

ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS off_days_used int;

ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS off_days_required int;

ALTER TABLE payroll
  ADD COLUMN IF NOT EXISTS off_days_warning text
    CHECK (off_days_warning IN ('shortage','excess'));

COMMENT ON COLUMN payroll.pay_mode IS
  '산정 시점 employment_types.pay_mode 스냅샷. 과거 정산 보존용';
COMMENT ON COLUMN payroll.bonus IS
  'salary 행: 매월 사용자 입력 상여금. hourly 행: 항상 0';
COMMENT ON COLUMN payroll.off_days_used IS
  'salary 행: 해당 월 실제 휴무일수. hourly 행: NULL';
COMMENT ON COLUMN payroll.off_days_required IS
  'salary 행: 산정 시점 employment_types.monthly_off_days 스냅샷. hourly 행: NULL';
COMMENT ON COLUMN payroll.off_days_warning IS
  'salary 행: used<required면 shortage, used>required면 excess, 같으면 NULL. 표시·경고용 (자동 감액 없음)';
COMMENT ON COLUMN payroll.total IS
  'base_pay + bonus + allowances - deductions';

-- =============================================================
-- 5. 기존 employment_types 행 시드 (수동 보정용 예시 — 필요 시 주석 해제)
-- =============================================================
-- 기존 행이 이미 있다면 code별로 UPDATE해서 pay_mode·monthly_off_days를 채워야 함.
-- 신규 매장은 application에서 INSERT 시 함께 세팅하면 됨.
--
-- UPDATE employment_types SET pay_mode='salary', monthly_off_days=8 WHERE code IN ('fulltime','manager');
-- UPDATE employment_types SET pay_mode='hourly', monthly_off_days=NULL WHERE code IN ('parttime','shortterm');
