import { formatHeroDisplayName } from '../lib/dotaHero'
import { useHeroImageUrl } from '../hooks/useHeroImageUrl'

export function HeroHeader(props: {
  heroInternalName: string
  level: number | undefined
  hp: number | undefined
  hpMax: number | undefined
  mana: number | undefined
  manaMax: number | undefined
  formatMaybeNumber: (value: number | undefined) => string
}) {
  const displayName = formatHeroDisplayName(props.heroInternalName)
  const imageQuery = useHeroImageUrl(props.heroInternalName)
  const url = imageQuery.data ?? undefined

  return (
    <div className="grid grid-cols-[theme(spacing.24)_minmax(0,1fr)] grid-rows-[auto_auto] gap-x-3">
      <div className="w-24 overflow-hidden rounded bg-slate-100 aspect-video">
        {url ? (
          <img className="h-full w-full object-cover" src={url} alt={displayName} loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">(no image)</div>
        )}
      </div>

      <div className="min-w-0 text-xs text-slate-700 self-stretch grid grid-rows-3 col-start-2 row-start-1">
        <div className="flex items-center">Level: {props.formatMaybeNumber(props.level)}</div>
        <div className="flex items-center">
          HP: {props.formatMaybeNumber(props.hp)} / {props.formatMaybeNumber(props.hpMax)}
        </div>
        <div className="flex items-center">
          Mana: {props.formatMaybeNumber(props.mana)} / {props.formatMaybeNumber(props.manaMax)}
        </div>
      </div>

      <div className="mt-1 text-xs font-semibold text-slate-900 col-start-1 row-start-2">{displayName}</div>
    </div>
  )
}
