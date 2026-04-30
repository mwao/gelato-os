-- 매장별 오픈/미들/마감 기본 시간대 (근무관리 탭에서 편집)
-- Supabase SQL Editor에서 한 번 실행.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS shift_open_start text DEFAULT '09:00';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS shift_open_end text DEFAULT '14:00';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS shift_middle_start text DEFAULT '14:00';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS shift_middle_end text DEFAULT '19:00';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS shift_close_start text DEFAULT '19:00';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS shift_close_end text DEFAULT '22:00';

COMMENT ON COLUMN stores.shift_open_start IS 'HH:MM 직원 근무관리 기본값';
COMMENT ON COLUMN stores.shift_open_end IS 'HH:MM';
COMMENT ON COLUMN stores.shift_middle_start IS 'HH:MM';
COMMENT ON COLUMN stores.shift_middle_end IS 'HH:MM';
COMMENT ON COLUMN stores.shift_close_start IS 'HH:MM';
COMMENT ON COLUMN stores.shift_close_end IS 'HH:MM';
