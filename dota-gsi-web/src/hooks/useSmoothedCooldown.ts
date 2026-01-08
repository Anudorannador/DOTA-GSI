import { useEffect, useRef, useState } from 'react'

export function useSmoothedCooldown(cooldownSeconds: number | undefined) {
  const baseRef = useRef<{ cd: number; atMs: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  const [value, setValue] = useState<number>(() => {
    return typeof cooldownSeconds === 'number' && Number.isFinite(cooldownSeconds) ? cooldownSeconds : 0
  })

  useEffect(() => {
    const cd = typeof cooldownSeconds === 'number' && Number.isFinite(cooldownSeconds) ? cooldownSeconds : 0
    baseRef.current = { cd, atMs: Date.now() }
    setValue(cd)

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const tick = () => {
      const base = baseRef.current
      if (!base) return

      const elapsedSec = (Date.now() - base.atMs) / 1000
      const next = Math.max(0, base.cd - elapsedSec)
      setValue(next)

      if (next > 0) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    if (cd > 0) {
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [cooldownSeconds])

  return value
}
