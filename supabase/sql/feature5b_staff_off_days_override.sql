-- Feature 5b: 직원별 월 휴무 의무 오버라이드
-- 실행 순서: feature5_pay_mode.sql 이후
-- 변경 범위:
--   1. staff: monthly_off_days 추가 (nullable, employment_types 기본값 폴백)
-- RLS 패턴: 기존 staff 정책 그대로 사용 (테이블 단위 정책)

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS monthly_off_days int;

COMMENT ON COLUMN staff.monthly_off_days IS
  'salary 모드 직원의 월 휴무 의무 (개인별 오버라이드). NULL이면 employment_types.monthly_off_days 사용';
