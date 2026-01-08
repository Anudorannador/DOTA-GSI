import { CooldownFanOverlay } from './CooldownFanOverlay'
import { AbilityBar } from './AbilityBar'
import type { NeutralCraftingSelection, SpecialItem } from './ItemsPanel'
import { useItemImageUrl } from '../hooks/useItemImageUrl'

type Ability = {
  abilityKey: string
  name: string
  cooldown: number | undefined
  maxCooldown: number | undefined
  passive: boolean | undefined
}

function ItemLikeIcon(props: {
  itemName: string
  grayscale?: boolean
  cooldown?: number | undefined
  maxCooldown?: number | undefined
  alt: string
}) {
  const imageQuery = useItemImageUrl(props.itemName)
  const url = imageQuery.data ?? undefined

  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
      {url ? (
        <img
          className={`h-full w-full object-cover ${props.grayscale ? 'grayscale opacity-40' : ''}`}
          src={url}
          alt={props.alt}
          loading="lazy"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600 ${
            props.grayscale ? 'opacity-40' : ''
          }`}
        >
          ?
        </div>
      )}
      <CooldownFanOverlay cooldown={props.cooldown} maxCooldown={props.maxCooldown} />
    </div>
  )
}

export function AbilityRow(props: {
  abilities: Ability[]
  teleports: SpecialItem[]
  neutralCrafting: NeutralCraftingSelection
}) {
  const teleport = props.teleports[0]
  const teleportEmpty = !teleport || !teleport.name || teleport.name === 'empty'

  const trinketName = props.neutralCrafting?.trinket.name
  const enchantName = props.neutralCrafting?.enchantment.name

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      <AbilityBar abilities={props.abilities} />

      <div className="h-10 w-10 shrink-0" aria-hidden="true" />

      <ItemLikeIcon
        itemName="item_tpscroll"
        grayscale={teleportEmpty}
        cooldown={teleportEmpty ? 0 : teleport?.cooldown}
        maxCooldown={teleportEmpty ? 0 : teleport?.maxCooldown}
        alt="Teleport"
      />

      {trinketName ? (
        <ItemLikeIcon
          itemName={trinketName}
          cooldown={props.neutralCrafting?.trinket.cooldown}
          maxCooldown={props.neutralCrafting?.trinket.maxCooldown}
          alt="TRINK"
        />
      ) : null}

      {enchantName ? <ItemLikeIcon itemName={enchantName} alt="ENCH" /> : null}
    </div>
  )
}
