import { useEffect, useRef, useState } from 'react'

function normalizeCooldown(cooldownSeconds: number | undefined): number {
  return typeof cooldownSeconds === 'number' && Number.isFinite(cooldownSeconds) ? cooldownSeconds : 0
}

/**
 * Counts a cooldown down to zero smoothly via requestAnimationFrame.
 * State is only updated from the rAF callback (never synchronously inside the
 * effect), so it avoids cascading renders.
 */
export function useSmoothedCooldown(cooldownSeconds: number | undefined) {
  const rafRef = useRef<number | null>(null)
  const [value, setValue] = useState<number>(() => normalizeCooldown(cooldownSeconds))

  useEffect(() => {
    const cd = normalizeCooldown(cooldownSeconds)
    const startedAtMs = Date.now()

    const tick = () => {
      const elapsedSec = (Date.now() - startedAtMs) / 1000
      const next = Math.max(0, cd - elapsedSec)
      setValue(next)
      rafRef.current = next > 0 ? requestAnimationFrame(tick) : null
    }

    // Schedule one frame even when cd is 0 so `value` resyncs to the new input.
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [cooldownSeconds])

  return value
}
