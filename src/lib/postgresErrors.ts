/** Supabase/PostgREST 클라이언트에서 던지는 객체 형태 대비 */
export function getPostgrestMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: string }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  return String(err)
}

/** UNIQUE 충돌 (PostgreSQL 23505, 일반적으로 HTTP 409와 함께 보고됨) */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const o = err as { code?: string; message?: string }
  if (o.code === '23505') return true
  const msg = typeof o.message === 'string' ? o.message : ''
  return /duplicate key|unique constraint|violates unique constraint/i.test(msg)
}
