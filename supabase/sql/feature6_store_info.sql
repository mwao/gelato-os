-- 매장 기본 정보 — MY 페이지에서 사장님이 직접 입력. 세무사 전달용 명세서 헤더에 포함.
-- Supabase SQL Editor에서 한 번 실행.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS business_no text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN stores.business_no IS '사업자등록번호 (예: 123-45-67890). 세무사 명세서·세금계산서 발행용';
COMMENT ON COLUMN stores.owner_name IS '대표자명';
COMMENT ON COLUMN stores.address IS '매장 주소';
COMMENT ON COLUMN stores.phone IS '매장 연락처';

-- RLS는 stores 테이블 정책을 그대로 사용 (owner_id = auth.uid()).
-- 신규 컬럼이라 별도 정책 추가 불필요.
