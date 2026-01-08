export function probeImage(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const img = new Image()

    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      cleanup()
      resolve(ok)
    }

    const timer = window.setTimeout(() => finish(false), timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
    }

    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = url
  })
}

export async function firstReachableImageUrl(
  candidates: string[],
  timeoutMsPerCandidate = 8000,
): Promise<string | null> {
  for (const url of candidates) {
    // Sequential probing is intentional: avoid spamming hosts.
    // React Query dedupes calls per hero key.
    // eslint-disable-next-line no-await-in-loop
    const ok = await probeImage(url, timeoutMsPerCandidate)
    if (ok) return url
  }

  return null
}
