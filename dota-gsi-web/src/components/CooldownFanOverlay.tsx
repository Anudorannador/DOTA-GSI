import { useSmoothedCooldown } from '../hooks/useSmoothedCooldown'

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

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

  // Requirement: if cd is 0 or invalid -> show original image (no overlay)
  // Also: if max is invalid -> no overlay.
  const enabled = cd0 > 0 && max > 0
  const cd = useSmoothedCooldown(enabled ? cd0 : 0)

  if (!enabled || cd <= 0) return null

  const ratio = clamp01(cd / max)
  const deg = ratio * 360

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          // Start at 12 o'clock, counter-clockwise.
          background: `conic-gradient(from 0deg, rgb(0 0 0 / 0.45) 0deg ${deg}deg, rgb(0 0 0 / 0) ${deg}deg 360deg)`,
          transform: 'scaleX(-1)',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white drop-shadow">
        {formatCd(cd)}
      </div>
    </div>
  )
}
