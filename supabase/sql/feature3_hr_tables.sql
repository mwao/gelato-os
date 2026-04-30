-- Feature 3 — 인력 관리 (설계-2026-04-29-v1.2)
-- Supabase SQL Editor에서 stores.owner_id = auth.uid() 패턴과 함께 실행하세요.

-- ─────────────────────────────────────────────────────────────────────────────
-- employment_types
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employment_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code       text NOT NULL,
  label      text NOT NULL,
  UNIQUE (store_id, code)
);

ALTER TABLE employment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employment_types_store_all"
  ON employment_types FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- staff
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                 uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employment_type_id       uuid REFERENCES employment_types(id) ON DELETE SET NULL,
  name                     text NOT NULL,
  phone                    text,
  hourly_rate              numeric NOT NULL DEFAULT 0,
  hire_date                date,
  health_cert_expires      date,
  photo_storage_path       text,
  resume_storage_path      text,
  health_cert_storage_path text,
  created_at               timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_store ON staff(store_id);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_store_all"
  ON staff FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- staff_default_shifts (직원 프로필 근무요일·시프트)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_default_shifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  shift        text NOT NULL CHECK (shift IN ('open', 'middle', 'close')),
  UNIQUE (staff_id, day_of_week, shift)
);

CREATE INDEX IF NOT EXISTS idx_staff_default_shifts_staff ON staff_default_shifts(staff_id);

ALTER TABLE staff_default_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_default_shifts_store_all"
  ON staff_default_shifts FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- staff_calendar_assignments (직원별 월 달력 셀)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_calendar_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  yyyymm     text NOT NULL,
  day        smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  shift      text NOT NULL CHECK (shift IN ('open', 'middle', 'close')),
  UNIQUE (staff_id, yyyymm, day)
);

CREATE INDEX IF NOT EXISTS idx_staff_cal_staff_ym ON staff_calendar_assignments(staff_id, yyyymm);

ALTER TABLE staff_calendar_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_calendar_assignments_store_all"
  ON staff_calendar_assignments FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 주간 근무표 슬롯 + 배정 (다대다)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_week_slots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  week_start  date NOT NULL,
  slot_index  smallint NOT NULL,
  day_index   smallint NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  UNIQUE (store_id, week_start, slot_index, day_index)
);

CREATE INDEX IF NOT EXISTS idx_schedule_week_slots_lookup
  ON schedule_week_slots(store_id, week_start);

ALTER TABLE schedule_week_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_week_slots_store_all"
  ON schedule_week_slots FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS schedule_week_slot_assignees (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id  uuid NOT NULL REFERENCES schedule_week_slots(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  UNIQUE (slot_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_week_assignees_staff ON schedule_week_slot_assignees(staff_id);

ALTER TABLE schedule_week_slot_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_week_slot_assignees_store_all"
  ON schedule_week_slot_assignees FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM schedule_week_slots s
      WHERE s.id = slot_id
        AND s.store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM schedule_week_slots s
      WHERE s.id = slot_id
        AND s.store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    )
    AND staff_id IN (SELECT id FROM staff WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 월간 근무표 (날짜별 직원 시프트)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_month_cells (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date  date NOT NULL,
  shift      text NOT NULL CHECK (shift IN ('open', 'middle', 'close')),
  UNIQUE (staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_month_cells_store_date ON schedule_month_cells(store_id, work_date);

ALTER TABLE schedule_month_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_month_cells_store_all"
  ON schedule_month_cells FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 출퇴근 실적 (급여 Phase 9 연동)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id             uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  check_in             timestamptz,
  check_out            timestamptz,
  manually_corrected   boolean DEFAULT false,
  approved_by          uuid REFERENCES staff(id) ON DELETE SET NULL,
  approved_at          timestamptz,
  correction_note      text,
  is_baseline          boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_attendance_staff_in ON attendance(staff_id, check_in);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_store_all"
  ON attendance FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 체크리스트
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_items (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shift    text NOT NULL CHECK (shift IN ('open', 'middle', 'close')),
  title    text NOT NULL
);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_items_store_all"
  ON checklist_items FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS checklist_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  checklist_item_id uuid NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  staff_id          uuid REFERENCES staff(id) ON DELETE SET NULL,
  completed_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_logs_item ON checklist_logs(checklist_item_id);

ALTER TABLE checklist_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_logs_store_all"
  ON checklist_logs FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- 동일 직원·같은 근무일 중복 출퇴근 행은 앱에서 조회 후 업데이트/삽입으로 처리합니다.
