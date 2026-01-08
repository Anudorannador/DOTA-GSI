import { useAbilityImageUrl } from '../hooks/useAbilityImageUrl'
import { CooldownFanOverlay } from './CooldownFanOverlay'

type Ability = {
  abilityKey: string
  name: string
  cooldown: number | undefined
  maxCooldown: number | undefined
  passive: boolean | undefined
}

function AbilityIcon(props: { ability: Ability }) {
  const { name, cooldown, maxCooldown, passive } = props.ability
  const imageQuery = useAbilityImageUrl(name, passive)
  const url = imageQuery.data?.url ?? undefined
  const notFound = imageQuery.data?.notFound ?? false

  // Requirement: if icon is confirmed 404 AND ability is passive => do not render.
  if (passive === true && notFound) {
    return null
  }

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-slate-100">
      {url ? (
        <img className="h-full w-full object-cover" src={url} alt={name} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium leading-tight text-slate-600">
          {name}
        </div>
      )}

      <CooldownFanOverlay cooldown={cooldown} maxCooldown={maxCooldown} />
    </div>
  )
}

export function AbilityBar(props: { abilities: Ability[] }) {
  if (props.abilities.length === 0) {
    return <div className="text-slate-400">(none)</div>
  }

  return (
    <div className="flex gap-1 overflow-x-auto">
      {props.abilities.map((ab) => {
        const el = <AbilityIcon key={ab.abilityKey} ability={ab} />
        return el
      })}
    </div>
  )
}
