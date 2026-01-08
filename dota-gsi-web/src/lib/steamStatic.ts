export const STEAMSTATIC_HOSTS = [
  'https://cdn.steamstatic.com/',
  'https://cdn.cloudflare.steamstatic.com/',
  'https://cdn.akamai.steamstatic.com/',
  'https://steamcdn-a.akamaihd.net/',
] as const

export function buildSteamstaticUrls(path: string, hosts: readonly string[] = STEAMSTATIC_HOSTS): string[] {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return hosts.map((h) => h + cleanPath)
}
