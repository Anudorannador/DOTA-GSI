export function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

/** "sand_king" -> "Sand King" (also tolerates leading/trailing/double underscores). */
export function formatSnakeDisplayName(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function stripHeroPrefix(value: string): string {
  return stripPrefix(value, 'npc_dota_hero_')
}

export function formatHeroDisplayName(value: string): string {
  return formatSnakeDisplayName(stripHeroPrefix(value))
}
