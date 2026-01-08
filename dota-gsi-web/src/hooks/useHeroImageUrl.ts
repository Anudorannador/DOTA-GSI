import { useQuery } from '@tanstack/react-query'
import { stripHeroPrefix } from '../lib/dotaHero'
import { firstReachableImageUrl } from '../lib/imageProbe'
import { getHeroImageCandidates } from '../lib/steamCdn'

export function useHeroImageUrl(heroInternalName: string | undefined) {
  const heroKey = heroInternalName ? stripHeroPrefix(heroInternalName) : undefined

  return useQuery({
    queryKey: ['heroImageUrl', heroKey],
    enabled: Boolean(heroKey),
    queryFn: async () => {
      if (!heroInternalName) return null
      const candidates = getHeroImageCandidates(heroInternalName)
      return firstReachableImageUrl(candidates)
    },
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnReconnect: true,
    // If we couldn't resolve an image (network down / CDN hiccup), retry periodically
    // but do NOT spam: at most once per minute per hero.
    refetchInterval: (query) => {
      return query.state.data ? false : 60_000
    },
  })
}
