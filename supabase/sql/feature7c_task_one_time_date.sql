-- =============================================================================
-- feature7c_task_one_time_date.sql
-- store_tasks에 1회성 업무 날짜 지정 컬럼 추가.
-- Supabase SQL Editor에서 1회 실행.
-- =============================================================================

ALTER TABLE store_tasks
  ADD COLUMN IF NOT EXISTS one_time_date date;

COMMENT ON COLUMN store_tasks.one_time_date IS
  'recurrence_type=once 인 경우 실행할 날짜. 그 외에는 NULL.';

-- 조회 성능 — 「오늘 1회성 업무」 필터링용
CREATE INDEX IF NOT EXISTS store_tasks_store_one_time_date_idx
  ON store_tasks(store_id, one_time_date)
  WHERE one_time_date IS NOT NULL;

-- 정합성 — recurrence_type='once' 이면 날짜 필수, 그 외에는 NULL
ALTER TABLE store_tasks
  DROP CONSTRAINT IF EXISTS store_tasks_once_date_valid;
ALTER TABLE store_tasks
  ADD CONSTRAINT store_tasks_once_date_valid
  CHECK (
    (recurrence_type = 'once' AND one_time_date IS NOT NULL)
    OR (recurrence_type <> 'once' AND one_time_date IS NULL)
  );

-- 확인:
--   \d store_tasks                                       -- one_time_date date 보이면 OK
