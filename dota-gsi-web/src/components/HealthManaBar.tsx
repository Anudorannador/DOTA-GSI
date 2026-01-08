/**
 * Compact HP/MP progress bars for the player card.
 * Shows current/max values overlaid on the bar.
 */

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function formatValue(cur: number, max: number): string {
  return `${Math.round(cur)}/${Math.round(max)}`
}

export function HealthBar(props: { current: number | undefined; max: number | undefined }) {
  const cur = props.current ?? 0
  const max = props.max ?? 1
  const ratio = max > 0 ? clamp01(cur / max) : 0

  return (
    <div className="relative h-4 w-full overflow-hidden rounded-sm bg-slate-700">
      <div
        className="h-full bg-green-600 transition-[width] duration-150"
        style={{ width: `${ratio * 100}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
        {formatValue(cur, max)}
      </span>
    </div>
  )
}

export function ManaBar(props: { current: number | undefined; max: number | undefined }) {
  const cur = props.current ?? 0
  const max = props.max ?? 1
  const ratio = max > 0 ? clamp01(cur / max) : 0

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-sm bg-slate-700">
      <div
        className="h-full bg-blue-500 transition-[width] duration-150"
        style={{ width: `${ratio * 100}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
        {formatValue(cur, max)}
      </span>
    </div>
  )
}
