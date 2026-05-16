// Edge Function — 매장 계정 삭제 (재발급 흐름 대비)
// POST /functions/v1/delete-store-account
// Headers: Authorization: Bearer <사장님 JWT>
// Body:    { store_id: uuid }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { corsHeaders } from '../_shared/cors.ts'

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: '인증 토큰이 없습니다.' }, 401)
    }
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) {
      return jsonResponse({ error: 'Supabase 환경 변수가 설정되지 않았습니다.' }, 500)
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser()
    if (userErr || !user) {
      return jsonResponse({ error: '유효하지 않은 인증 토큰입니다.' }, 401)
    }

    let body: { store_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: '요청 본문 파싱 실패.' }, 400)
    }
    const storeId = body.store_id?.trim()
    if (!storeId) {
      return jsonResponse({ error: 'store_id 가 필요합니다.' }, 400)
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: store, error: storeErr } = await admin
      .from('stores')
      .select('id, owner_id, store_account_user_id')
      .eq('id', storeId)
      .maybeSingle()
    if (storeErr || !store) {
      return jsonResponse({ error: '매장을 찾을 수 없습니다.' }, 404)
    }
    if (store.owner_id !== user.id) {
      return jsonResponse({ error: '본인 매장만 작업할 수 있습니다.' }, 403)
    }
    if (!store.store_account_user_id) {
      return jsonResponse({ error: '발급된 매장 계정이 없습니다.' }, 404)
    }

    // 1. stores 연결 해제 먼저 (FK 안전)
    const { error: unlinkErr } = await admin
      .from('stores')
      .update({
        store_account_user_id: null,
        store_account_email: null,
      })
      .eq('id', store.id)
    if (unlinkErr) {
      return jsonResponse({ error: '매장 연결 해제 실패: ' + unlinkErr.message }, 500)
    }

    // 2. auth 사용자 삭제
    const { error: delErr } = await admin.auth.admin.deleteUser(
      store.store_account_user_id,
    )
    if (delErr) {
      return jsonResponse({ error: '사용자 삭제 실패: ' + delErr.message }, 500)
    }

    return jsonResponse({ ok: true }, 200)
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})
