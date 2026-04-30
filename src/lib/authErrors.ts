/** Maps low-level browser/transport errors to actionable Korean copy for Supabase Auth. */
export function formatAuthErrorMessage(raw: string): string {
  const m = raw.trim()
  if (m === 'Failed to fetch' || /^networkerror$/i.test(m)) {
    return [
      '브라우저가 Supabase(Auth API)에 연결하지 못했습니다.',
      '',
      '· .env의 VITE_SUPABASE_URL이 Project Settings → API의 Project URL과 같은지(복사 시 공백·줄바꿈 없음), https로 시작하는지 확인하세요.',
      '· .env를 고쳤다면 npm run dev를 다시 실행하세요.',
      '· VPN·회사 방화벽·보안 프로그램을 잠시 끄고 재시도해 보세요.',
      '· Supabase 대시보드에서 프로젝트가 일시중지(pause)되지 않았는지 확인하세요.',
    ].join('\n')
  }
  return raw
}
