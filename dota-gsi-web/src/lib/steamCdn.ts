import { stripHeroPrefix } from './dotaHero'
import { buildSteamstaticUrls } from './steamStatic'

export function getHeroImageCandidates(heroInternalName: string): string[] {
  const heroKey = stripHeroPrefix(heroInternalName)

  const reactPath = `apps/dota2/images/dota_react/heroes/${heroKey}.png`
  const fullPath = `apps/dota2/images/heroes/${heroKey}_full.png`

  return [...buildSteamstaticUrls(reactPath), ...buildSteamstaticUrls(fullPath)]
}
