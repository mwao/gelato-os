-- =============================================================================
-- feature8_storage_bucket.sql
-- 업무용 Supabase Storage 버킷 + RLS 정책.
-- Path 형식: `tasks/{store_id}/...` — 첫 폴더가 매장 ID인지로 접근 통제.
-- Supabase SQL Editor에서 1회 실행.
-- =============================================================================

-- 1. 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gelato-tasks',
  'gelato-tasks',
  false,                                          -- 비공개. signed URL로만 접근
  5242880,                                        -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']  -- 이미지만
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS 정책 — storage.objects는 RLS가 기본 활성화돼 있음
-- Path 검증: tasks/{store_id}/... 형식. store_id가 본인 owner 또는 store_account.

-- SELECT (signed URL 발급용 + 직접 download)
DROP POLICY IF EXISTS "gelato_tasks_select" ON storage.objects;
CREATE POLICY "gelato_tasks_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'gelato-tasks'
    AND (storage.foldername(name))[1] = 'tasks'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM stores
      WHERE owner_id = auth.uid() OR store_account_user_id = auth.uid()
    )
  );

-- INSERT
DROP POLICY IF EXISTS "gelato_tasks_insert" ON storage.objects;
CREATE POLICY "gelato_tasks_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gelato-tasks'
    AND (storage.foldername(name))[1] = 'tasks'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM stores
      WHERE owner_id = auth.uid() OR store_account_user_id = auth.uid()
    )
  );

-- UPDATE (덮어쓰기·메타데이터)
DROP POLICY IF EXISTS "gelato_tasks_update" ON storage.objects;
CREATE POLICY "gelato_tasks_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gelato-tasks'
    AND (storage.foldername(name))[1] = 'tasks'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM stores
      WHERE owner_id = auth.uid() OR store_account_user_id = auth.uid()
    )
  );

-- DELETE
DROP POLICY IF EXISTS "gelato_tasks_delete" ON storage.objects;
CREATE POLICY "gelato_tasks_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'gelato-tasks'
    AND (storage.foldername(name))[1] = 'tasks'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM stores
      WHERE owner_id = auth.uid() OR store_account_user_id = auth.uid()
    )
  );

-- 확인:
--   SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='gelato-tasks';
--   SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname LIKE 'gelato%';
