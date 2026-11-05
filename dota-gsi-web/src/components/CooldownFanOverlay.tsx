import { useSmoothedCooldown } from '../hooks/useSmoothedCooldown'
import { clamp01 } from '../lib/math'

function formatCd(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (value <= 0) return ''
  return String(Math.ceil(value))
}

export function CooldownFanOverlay(props: {
  cooldown: number | undefined
  maxCooldown: number | undefined
}) {
  const cd0 = typeof props.cooldown === 'number' && Number.isFinite(props.cooldown) ? props.cooldown : 0
  const max =
    typeof props.maxCooldown === 'number' && Number.isFinite(props.maxCooldown) ? props.maxCooldown : 0

  // Items often send a remaining cooldown and no max. Still show the number.
  // The pie needs a max; without one, show the number only.
  const cd = useSmoothedCooldown(cd0 > 0 ? cd0 : 0)

  if (cd0 <= 0 || cd <= 0) return null

  const ratio = max > 0 ? clamp01(cd / max) : null
  const deg = ratio === null ? 0 : ratio * 360

  return (
    <div className="absolute inset-0">
      {ratio !== null ? (
        <div
          className="absolute inset-0"
          style={{
            // Start at 12 o'clock, counter-clockwise.
            background: `conic-gradient(from 0deg, rgb(0 0 0 / 0.45) 0deg ${deg}deg, rgb(0 0 0 / 0) ${deg}deg 360deg)`,
            transform: 'scaleX(-1)',
          }}
        />
      ) : null}
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white drop-shadow">
        {formatCd(cd)}
      </div>
    </div>
  )
}
