-- 기존 DB: (staff_id, day_of_week)만 유일 → 같은 요일에 시프트가 달랐는데도 1행만 허용됨.
-- → (staff_id, day_of_week, shift)로 변경: 동일 요일+동일 시프트만 중복 불가.
-- Supabase SQL Editor에서 한 번 실행 (이미 신규 스키마로 맞췄다면 생략 가능).

ALTER TABLE staff_default_shifts
  DROP CONSTRAINT IF EXISTS staff_default_shifts_staff_id_day_of_week_key;

ALTER TABLE staff_default_shifts
  ADD CONSTRAINT staff_default_shifts_staff_dow_shift_key
  UNIQUE (staff_id, day_of_week, shift);
