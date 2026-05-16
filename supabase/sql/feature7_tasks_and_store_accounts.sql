-- =============================================================================
-- feature7_tasks_and_store_accounts.sql
-- v1.5 — 사장님/매장 계정 분리 + 업무(Tasks) 기능 신규 + 체크리스트 폐기 마크
-- Supabase SQL Editor에서 1회 실행.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. stores 테이블 — 매장 계정(Auth user) 연결 컬럼
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_account_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stores_store_account_user_id_idx
  ON stores(store_account_user_id);

COMMENT ON COLUMN stores.store_account_user_id IS
  '매장 계정의 Supabase Auth user.id. 매장당 1개. 매장 단말에서 이 계정으로 로그인.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. store_tasks — 업무 마스터 (오픈/미들/마감/주간/월간/기타 + 반복주기)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('open','middle','close','weekly','monthly','other')),
  title text NOT NULL,
  description text,
  description_images text[] DEFAULT ARRAY[]::text[],
  -- 보고 방식: 체크 / 사진 / 메모 (셋 중 1개)
  report_type text NOT NULL CHECK (report_type IN ('check','photo','memo')),
  -- 반복 주기
  recurrence_type text NOT NULL CHECK (recurrence_type IN ('daily','weekly','monthly','once')),
  recurrence_days integer[],            -- weekly용 — 0=월 ... 6=일. ex: [0,2,4] = 월수금
  recurrence_day_of_month integer,      -- monthly용 — 1~31
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_tasks_store_id_idx ON store_tasks(store_id);
CREATE INDEX IF NOT EXISTS store_tasks_store_category_idx ON store_tasks(store_id, category);

COMMENT ON TABLE store_tasks IS
  '매장 업무 마스터. 오픈/미들/마감/주간/월간/기타 카테고리. 체크박스 외 사진·메모 보고 지원.';
COMMENT ON COLUMN store_tasks.description_images IS
  'Supabase Storage path들. 업무 설명용 참고 이미지 (복장 예시·청소 위치 등 표준화).';

ALTER TABLE store_tasks ENABLE ROW LEVEL SECURITY;

-- Owner: 본인 매장의 store_tasks 풀 권한 (CRUD)
CREATE POLICY "store_tasks_owner_all"
  ON store_tasks FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- Store account: 본인 매장의 store_tasks 읽기만 (업무 설정은 owner 전용)
CREATE POLICY "store_tasks_store_account_read"
  ON store_tasks FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. store_task_reports — 업무 보고 로그
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_task_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES store_tasks(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  -- report_type에 따라 채워지는 필드 (다른 필드는 NULL)
  checked boolean,
  memo text,
  photo_urls text[] DEFAULT ARRAY[]::text[],
  UNIQUE(task_id, staff_id, work_date)  -- 동일 날짜·직원·업무 중복 방지
);

CREATE INDEX IF NOT EXISTS store_task_reports_store_date_idx
  ON store_task_reports(store_id, work_date);
CREATE INDEX IF NOT EXISTS store_task_reports_task_date_idx
  ON store_task_reports(task_id, work_date);
CREATE INDEX IF NOT EXISTS store_task_reports_staff_date_idx
  ON store_task_reports(staff_id, work_date);

COMMENT ON TABLE store_task_reports IS
  '업무별 직원별 일자별 보고 1건. staff_id는 매장 모드에서 보고 등록 시 드롭다운으로 선택.';

ALTER TABLE store_task_reports ENABLE ROW LEVEL SECURITY;

-- Owner OR Store account: 본인 매장의 보고 풀 권한
CREATE POLICY "store_task_reports_full"
  ON store_task_reports FOR ALL TO authenticated
  USING (store_id IN (
    SELECT id FROM stores
    WHERE owner_id = auth.uid() OR store_account_user_id = auth.uid()
  ))
  WITH CHECK (store_id IN (
    SELECT id FROM stores
    WHERE owner_id = auth.uid() OR store_account_user_id = auth.uid()
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. 매장 계정이 운영 데이터(attendance, schedule_month_cells)에 접근하도록 RLS 확장
-- ─────────────────────────────────────────────────────────────────────────────
-- 기존 정책은 owner_id만 체크. 매장 계정에도 동일 권한 부여.

CREATE POLICY "attendance_store_account"
  ON attendance FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

CREATE POLICY "schedule_month_cells_store_account"
  ON schedule_month_cells FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- 직원 명단(보고자 식별·근무자 목록용) — 매장 계정은 READ만
CREATE POLICY "staff_store_account_read"
  ON staff FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- 매장 정보(매장명·시프트 시간) — 매장 계정 READ
CREATE POLICY "stores_store_account_read"
  ON stores FOR SELECT TO authenticated
  USING (store_account_user_id = auth.uid());

-- 고용형태(시급제/월급제 판정용) — 매장 계정 READ
CREATE POLICY "employment_types_store_account_read"
  ON employment_types FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- 직원 기본 시프트(근무표 표시용) — 매장 계정 READ
CREATE POLICY "staff_default_shifts_store_account_read"
  ON staff_default_shifts FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- 직원 시프트 오버라이드(시각 결정 시) — 매장 계정 READ
CREATE POLICY "staff_shift_overrides_store_account_read"
  ON staff_shift_overrides FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 체크리스트 폐기 마크 (코드 제거 후 별도 마이그레이션에서 DROP 예정)
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE checklist_items IS
  'DEPRECATED v1.5 — store_tasks로 대체. 코드 제거 완료 후 별도 마이그레이션에서 DROP.';
COMMENT ON TABLE checklist_logs IS
  'DEPRECATED v1.5 — store_task_reports로 대체. 코드 제거 완료 후 별도 마이그레이션에서 DROP.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Supabase Storage 버킷 안내 (대시보드에서 별도 생성)
-- ─────────────────────────────────────────────────────────────────────────────
-- SQL로는 만들지 않음. Supabase 대시보드 → Storage → New bucket:
--   - 이름: gelato-tasks
--   - Public: false (사진 보고는 인증된 사용자만)
--   - File size limit: 5MB
--   - Allowed MIME: image/jpeg, image/png, image/webp
--
-- 버킷 RLS 정책 (Storage 탭의 Policies 섹션에서):
--   SELECT, INSERT: bucket_id='gelato-tasks' AND
--     (SUBSTRING(name FROM '^tasks/([^/]+)/') IN
--      (SELECT id::text FROM stores
--       WHERE owner_id=auth.uid() OR store_account_user_id=auth.uid()))
--
-- 자세한 Storage 정책은 Phase 2 (사진 보고 구현 시) 별도 마이그레이션에서 정리.

-- ─────────────────────────────────────────────────────────────────────────────
-- 끝. 적용 후 확인:
--   SELECT COUNT(*) FROM store_tasks;            -- 0이면 정상
--   SELECT COUNT(*) FROM store_task_reports;     -- 0이면 정상
--   \d stores                                     -- store_account_user_id 컬럼 보이면 정상
-- ─────────────────────────────────────────────────────────────────────────────
