-- Feature 4: 급여 & 정산
-- 실행 순서: feature3_hr_tables.sql 이후
-- RLS 패턴: store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())

CREATE TABLE IF NOT EXISTS payroll (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end   date NOT NULL,
  base_pay     numeric NOT NULL DEFAULT 0,
  allowances   numeric NOT NULL DEFAULT 0,   -- 주휴·야간 등 수당 (수동 입력, 자동화 미결)
  deductions   numeric NOT NULL DEFAULT 0,   -- 공제 (수동 입력)
  total        numeric NOT NULL DEFAULT 0,   -- base_pay + allowances - deductions (저장 시 계산)
  work_minutes integer NOT NULL DEFAULT 0,   -- 집계된 실근무 분
  note         text,
  confirmed    boolean NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (store_id, staff_id, period_start)
);

ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store owner full access" ON payroll
  USING  (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));
