-- Phase 2: allow authenticated users to insert their own row in `stores`.
-- Run in Supabase SQL Editor if INSERT from the app fails with RLS.
-- (SELECT policies may already exist from Phase 1; this adds INSERT.)

CREATE POLICY "store insert own row"
ON public.stores
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());
