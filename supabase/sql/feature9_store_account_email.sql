-- =============================================================================
-- feature9_store_account_email.sql
-- 매장 계정 이메일을 stores 테이블에 denormalize — UI에서 빠르게 표시.
-- Edge Function `create-store-account`가 발급 시 자동 채움.
-- =============================================================================

ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_account_email text;

COMMENT ON COLUMN stores.store_account_email IS
  '매장 계정 이메일 (denormalized). store_account_user_id와 함께 관리.';

-- 확인:
--   \d stores                            -- store_account_email text 보이면 OK
