// Edge Function — 매장 계정 발급
// POST /functions/v1/create-store-account
// Headers: Authorization: Bearer <사장님 JWT>
// Body:    { store_id: uuid, account_id: string, password: string }
//
// 흐름:
//   1. Authorization 헤더로 사장님 인증
//   2. store_id 매장의 owner_id == 호출자.id 검증
//   3. 이미 매장 계정 있으면 409
//   4. account_id 유효성 검증 + 「{account_id}@store.gelato.local」 합성 이메일
//   5. admin.auth.admin.createUser() — app_metadata.account_type='store', store_id 박음
//   6. stores.store_account_user_id + store_account_email UPDATE (실패 시 user 롤백)
//   7. 응답 { user_id, account_id, email, store_id }
//
// 「매장 ID」 UX 설계: 사장님·직원은 "gangnam" 같은 짧은 ID만 보지만, 내부적으로
// 「매장ID@store.gelato.local」 합성 이메일로 저장. Supabase Auth는 이메일 형식만
// 검증하고 메일은 안 보냄 (email_confirm=true로 우회).
//
// 환경 변수 (Supabase 플랫폼 자동 주입):
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

import { corsHeaders } from '../_shared/cors.ts'

const SYNTHETIC_EMAIL_DOMAIN = 'store.gelato.local'
const ACCOUNT_ID_RE = /^[a-z0-9][a-z0-9_-]{3,19}$/

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function validateAccountId(id: string): string | null {
  if (!id) return '매장 ID를 입력해 주세요.'
  if (id.length < 4) return '매장 ID는 4자 이상이어야 합니다.'
  if (id.length > 20) return '매장 ID는 20자 이하여야 합니다.'
  if (!ACCOUNT_ID_RE.test(id))
    return '매장 ID는 영문 소문자·숫자·언더바(_)·하이픈(-) 만 사용할 수 있고, 첫 글자는 영문·숫자입니다.'
  return null
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

    // 호출자 인증 — 사장님 JWT
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

    // 본문 파싱
    let body: { store_id?: string; account_id?: string; password?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: '요청 본문(JSON) 파싱 실패.' }, 400)
    }
    const storeId = body.store_id?.trim()
    const accountId = body.account_id?.trim().toLowerCase()
    const password = body.password
    if (!storeId || !accountId || !password) {
      return jsonResponse(
        { error: 'store_id · account_id · password 모두 필요합니다.' },
        400,
      )
    }
    const idErr = validateAccountId(accountId)
    if (idErr) {
      return jsonResponse({ error: idErr }, 400)
    }
    if (password.length < 6) {
      return jsonResponse({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)
    }
    const email = `${accountId}@${SYNTHETIC_EMAIL_DOMAIN}`

    // 관리자 클라이언트
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 매장 소유권 + 기존 계정 확인
    const { data: store, error: storeErr } = await admin
      .from('stores')
      .select('id, owner_id, store_account_user_id, name')
      .eq('id', storeId)
      .maybeSingle()
    if (storeErr || !store) {
      return jsonResponse({ error: '매장을 찾을 수 없습니다.' }, 404)
    }
    if (store.owner_id !== user.id) {
      return jsonResponse(
        { error: '본인 매장만 매장 계정을 발급할 수 있습니다.' },
        403,
      )
    }
    if (store.store_account_user_id) {
      return jsonResponse(
        {
          error:
            '이 매장은 이미 매장 계정이 발급되어 있습니다. 재발급은 「매장 계정 삭제」 후 다시 시도해 주세요.',
        },
        409,
      )
    }

    // 사용자 생성
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: {
          account_type: 'store',
          store_id: store.id,
        },
      })
    if (createErr || !created.user) {
      const m = createErr?.message ?? '사용자 생성에 실패했습니다.'
      const friendly = m.toLowerCase().includes('already')
        ? '이미 사용 중인 매장 ID입니다. 다른 ID로 시도해 주세요.'
        : m
      return jsonResponse({ error: friendly }, 500)
    }

    // 매장에 연결 + 이메일 denormalize
    const { error: linkErr } = await admin
      .from('stores')
      .update({
        store_account_user_id: created.user.id,
        store_account_email: created.user.email,
      })
      .eq('id', store.id)
    if (linkErr) {
      // 롤백: 생성된 사용자 삭제 (best-effort)
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {})
      return jsonResponse({ error: '매장 연결 실패: ' + linkErr.message }, 500)
    }

    return jsonResponse(
      {
        user_id: created.user.id,
        account_id: accountId,
        email: created.user.email,
        store_id: store.id,
      },
      200,
    )
  } catch (e) {
    return jsonResponse(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})
