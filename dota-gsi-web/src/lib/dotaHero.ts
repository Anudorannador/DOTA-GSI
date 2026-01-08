export function stripHeroPrefix(value: string): string {
  const prefix = 'npc_dota_hero_'
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

export function formatHeroDisplayName(value: string): string {
  const base = stripHeroPrefix(value)
  return base
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
