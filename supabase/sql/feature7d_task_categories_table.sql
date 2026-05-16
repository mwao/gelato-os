-- =============================================================================
-- feature7d_task_categories_table.sql
-- 업무 카테고리를 매장별 사용자 정의로 — 하드코딩된 enum 제거.
-- store_tasks.categories text[] 는 그대로 (code 문자열 배열).
-- task_categories 테이블이 매장별 사용 가능 카테고리 마스터 역할.
-- Supabase SQL Editor에서 1회 실행.
-- =============================================================================

-- 1. task_categories — 매장별 카테고리 마스터
CREATE TABLE IF NOT EXISTS task_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code text NOT NULL,             -- 'open', 'middle', ... 또는 사용자 추가 시 랜덤 코드
  label text NOT NULL,            -- 표시 이름 (사용자 편집 가능)
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, code)
);

CREATE INDEX IF NOT EXISTS task_categories_store_id_idx ON task_categories(store_id);

COMMENT ON TABLE task_categories IS
  '매장별 업무 카테고리 마스터. store_tasks.categories[] 가 이 테이블 code를 참조.';
COMMENT ON COLUMN task_categories.code IS
  'store_tasks.categories[] 에 들어가는 식별자. 변경 불가 (기존 task 무효화 방지).';
COMMENT ON COLUMN task_categories.label IS
  '사용자 표시 이름. 자유 편집 가능.';

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;

-- Owner: 본인 매장 카테고리 풀 권한
CREATE POLICY "task_categories_owner_all"
  ON task_categories FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- Store account: 본인 매장 카테고리 READ
CREATE POLICY "task_categories_store_account_read"
  ON task_categories FOR SELECT TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE store_account_user_id = auth.uid()));

-- 2. store_tasks.categories CHECK 완화 — 화이트리스트 제거, 1개 이상만 강제
ALTER TABLE store_tasks
  DROP CONSTRAINT IF EXISTS store_tasks_categories_valid;
ALTER TABLE store_tasks
  ADD CONSTRAINT store_tasks_categories_nonempty
  CHECK (cardinality(categories) > 0);

-- 3. 기존 매장 대상 기본 6개 카테고리 백필 (오픈/미들/마감/주간/월간/기타)
INSERT INTO task_categories (store_id, code, label, display_order)
SELECT s.id, c.code, c.label, c.ord
FROM stores s
CROSS JOIN (VALUES
  ('open',    '오픈',  1),
  ('middle',  '미들',  2),
  ('close',   '마감',  3),
  ('weekly',  '주간',  4),
  ('monthly', '월간',  5),
  ('other',   '기타',  6)
) AS c(code, label, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM task_categories tc
  WHERE tc.store_id = s.id AND tc.code = c.code
);

-- 확인:
--   SELECT store_id, code, label, display_order FROM task_categories ORDER BY store_id, display_order;
