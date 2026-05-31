/** Clamp a value to the inclusive [0, 1] range. */
export function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
