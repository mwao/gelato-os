export function AuthLoading() {
  return (
    <div className="flex min-h-[min(420px,70dvh)] flex-col items-center justify-center gap-4 py-16">
      <div
        className="size-9 animate-spin rounded-full border-2 border-muted border-t-primary shadow-sm"
        aria-hidden
      />
      <p className="text-[13px] font-medium text-muted-foreground">
        불러오는 중…
      </p>
    </div>
  )
}