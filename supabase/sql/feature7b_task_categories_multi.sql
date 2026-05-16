-- =============================================================================
-- feature7b_task_categories_multi.sql
-- store_tasks.category(text, 단일) → categories(text[], 다중)으로 마이그레이션.
-- 기존 단일 카테고리 데이터는 [category] 배열로 자동 이관.
-- Supabase SQL Editor에서 1회 실행.
-- =============================================================================

-- 1. 새 categories 컬럼 추가 (빈 배열 default)
ALTER TABLE store_tasks
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT ARRAY[]::text[];

-- 2. 기존 단일 카테고리 데이터 → categories 배열로 마이그레이션
UPDATE store_tasks
SET categories = ARRAY[category]
WHERE category IS NOT NULL
  AND cardinality(categories) = 0;

-- 3. 다중 카테고리 검증 CHECK 추가 (1개 이상 + 허용값 내)
ALTER TABLE store_tasks
  DROP CONSTRAINT IF EXISTS store_tasks_categories_valid;
ALTER TABLE store_tasks
  ADD CONSTRAINT store_tasks_categories_valid
  CHECK (
    cardinality(categories) > 0
    AND categories <@ ARRAY['open','middle','close','weekly','monthly','other']::text[]
  );

-- 4. 기존 단일 카테고리 인덱스·컬럼 제거
DROP INDEX IF EXISTS store_tasks_store_category_idx;
ALTER TABLE store_tasks DROP CONSTRAINT IF EXISTS store_tasks_category_check;
ALTER TABLE store_tasks DROP COLUMN IF EXISTS category;

-- 5. 다중 카테고리용 GIN 인덱스 (필터링 성능)
CREATE INDEX IF NOT EXISTS store_tasks_store_categories_idx
  ON store_tasks USING GIN (categories);

COMMENT ON COLUMN store_tasks.categories IS
  '업무 카테고리 다중 선택 — open/middle/close/weekly/monthly/other 중 1개 이상.';

-- 확인:
--   \d store_tasks                                          -- categories text[] 확인
--   SELECT title, categories FROM store_tasks LIMIT 5;      -- 배열 잘 들어갔는지
