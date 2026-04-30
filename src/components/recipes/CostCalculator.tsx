import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function formatKrw(n: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

type CostCalculatorProps = {
  tubCost: number
  cupsPerTub: string
  onCupsPerTubChange: (v: string) => void
  sellingPricePerCup: string
  onSellingPricePerCupChange: (v: string) => void
}

export function CostCalculator({
  tubCost,
  cupsPerTub,
  onCupsPerTubChange,
  sellingPricePerCup,
  onSellingPricePerCupChange,
}: CostCalculatorProps) {
  const cups = parseFloat(cupsPerTub.replace(/,/g, ''))
  const priceCup = parseFloat(sellingPricePerCup.replace(/,/g, ''))

  const cupCost =
    Number.isFinite(cups) && cups > 0 ? tubCost / cups : null
  const costRate =
    cupCost !== null &&
    Number.isFinite(priceCup) &&
    priceCup > 0
      ? (cupCost / priceCup) * 100
      : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">원가 · 마진</CardTitle>
        <CardDescription>
          1통 원가는 위 재료 배합에서 계산됩니다. 통당 컵 수와 컵 판매가를 넣으면
          컵당 원가와 원가율을 볼 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">1통 재료 원가</span>
            <span className="font-medium tabular-nums">{formatKrw(tubCost)}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cups-per-tub">1통당 컵 수</Label>
            <Input
              id="cups-per-tub"
              inputMode="decimal"
              placeholder="예: 25"
              value={cupsPerTub}
              onChange={(e) => onCupsPerTubChange(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="price-per-cup">컵 판매가 (원)</Label>
            <Input
              id="price-per-cup"
              inputMode="decimal"
              placeholder="예: 5500"
              value={sellingPricePerCup}
              onChange={(e) => onSellingPricePerCupChange(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-primary/15 bg-primary/[0.06] px-3 py-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">컵당 원가</span>
            <span className="font-medium tabular-nums">
              {cupCost !== null ? formatKrw(cupCost) : '—'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">원가율</span>
            <span className="font-medium tabular-nums">
              {costRate !== null
                ? `${costRate.toFixed(1)}%`
                : '—'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
