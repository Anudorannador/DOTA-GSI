/**
 * Compact player card for the mirrored 5v5 layout.
 * Displays hero portrait, level, HP/MP bars, abilities, TP, items, and neutral crafting.
 */

import { useHeroImageUrl } from '../hooks/useHeroImageUrl'
import { useItemImageUrl, formatItemFallbackLabel } from '../hooks/useItemImageUrl'
import { useAbilityImageUrl } from '../hooks/useAbilityImageUrl'
import { CooldownFanOverlay } from './CooldownFanOverlay'
import { HealthBar, ManaBar } from './HealthManaBar'
import type { ItemSlot, SpecialItem, NeutralCraftingSelection } from './ItemsPanel'

type Ability = {
  abilityKey: string
  name: string
  cooldown: number | undefined
  maxCooldown: number | undefined
  passive: boolean | undefined
  charges?: number | undefined
}

export type PlayerData = {
  playerKey: string
  heroName: string
  level: number | undefined
  hp: number | undefined
  hpMax: number | undefined
  mana: number | undefined
  manaMax: number | undefined
  alive: boolean | undefined
  respawnSeconds: number | undefined
  items: ItemSlot[]
  teleports: SpecialItem[]
  neutrals: SpecialItem[]
  neutralCrafting: NeutralCraftingSelection
  abilities: Ability[]
}

// ---------- Sub-components ----------

/** Format hero internal name to display name */
function formatHeroDisplayName(internalName: string): string {
  // npc_dota_hero_axe -> Axe
  const withoutPrefix = internalName.replace(/^npc_dota_hero_/, '')
  return withoutPrefix
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function HeroPortrait(props: {
  heroName: string
  level: number | undefined
  alive: boolean | undefined
  respawnSeconds: number | undefined
  mirrored?: boolean
}) {
  const imageQuery = useHeroImageUrl(props.heroName)
  const url = imageQuery.data ?? undefined
  const displayName = formatHeroDisplayName(props.heroName)
  const textAlign = props.mirrored ? 'text-right' : 'text-left'
  const isDead = props.alive === false
  const respawnLeft =
    props.respawnSeconds !== undefined ? Math.max(0, Math.ceil(props.respawnSeconds)) : undefined

  // Match height with 3x3 item grid: 3 × h-8 (32px) + 2 × gap-0.5 (2px) = ~100px
  // Portrait takes most of that, name takes ~14px
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      {/* Dota2 hero portraits are ~127x71, roughly 16:9 aspect ratio */}
      <div className="relative h-[92px] w-[146px] overflow-hidden rounded bg-slate-700">
        {url ? (
          <img
            className={`h-full w-full object-contain ${isDead ? 'grayscale opacity-40' : ''}`}
            src={url}
            alt={props.heroName}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">?</div>
        )}

        {/* Respawn countdown (inside portrait, centered) */}
        {isDead ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-3xl font-extrabold text-white">
            {respawnLeft !== undefined ? String(respawnLeft) : 'DEAD'}
          </div>
        ) : null}

        {/* Level badge */}
        <div className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-2 py-0.5 text-base font-bold text-white">
          {props.level ?? '?'}
        </div>
      </div>
      {/* Hero name below portrait */}
      <div className={`w-[146px] truncate text-xs font-medium text-slate-300 ${textAlign}`} title={displayName}>
        {displayName}
      </div>
    </div>
  )
}

function AbilityIcon(props: { ability: Ability }) {
  const { name, cooldown, maxCooldown, passive } = props.ability
  const imageQuery = useAbilityImageUrl(name, passive)
  const url = imageQuery.data?.url ?? undefined
  const notFound = imageQuery.data?.notFound ?? false

  // Hide passive abilities with no icon
  if (passive === true && notFound) {
    return null
  }

  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-slate-700">
      {url ? (
        <img className="h-full w-full object-cover" src={url} alt={name} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">?</div>
      )}
      {props.ability.charges !== undefined && props.ability.charges !== 0 ? (
        <div className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1.5 text-xs font-bold leading-4 text-white">
          {Math.trunc(props.ability.charges)}
        </div>
      ) : null}
      <CooldownFanOverlay cooldown={cooldown} maxCooldown={maxCooldown} />
    </div>
  )
}

function TpIcon(props: { teleport: SpecialItem | undefined }) {
  const tp = props.teleport
  const isEmpty = !tp || !tp.name || tp.name === 'empty'
  const imageQuery = useItemImageUrl('item_tpscroll')
  const url = imageQuery.data ?? undefined

  return (
    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-700">
      {url ? (
        <img
          className={`h-full w-full object-cover ${isEmpty ? 'grayscale opacity-40' : ''}`}
          src={url}
          alt="TP"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">TP</div>
      )}
      {!isEmpty && <CooldownFanOverlay cooldown={tp?.cooldown} maxCooldown={tp?.maxCooldown} />}
      {!isEmpty && tp?.charges !== undefined && tp.charges !== 0 ? (
        <div className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1.5 text-xs font-bold leading-4 text-white">
          {Math.trunc(tp.charges)}
        </div>
      ) : null}
    </div>
  )
}

function ItemIcon(props: {
  name: string | undefined
  cooldown?: number
  maxCooldown?: number
  grayscale?: boolean
  count?: number | undefined
}) {
  const isEmpty = !props.name || props.name === 'empty'
  const imageQuery = useItemImageUrl(isEmpty ? undefined : props.name)
  const url = imageQuery.data ?? undefined

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-700">
      {isEmpty ? null : url ? (
        <img
          className={`h-full w-full object-cover ${props.grayscale ? 'grayscale opacity-50' : ''}`}
          src={url}
          alt={props.name}
          loading="lazy"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center text-[10px] text-slate-400 ${
            props.grayscale ? 'opacity-50' : ''
          }`}
        >
          {formatItemFallbackLabel(props.name!)}
        </div>
      )}
      {!isEmpty && props.cooldown !== undefined && props.cooldown > 0 && (
        <CooldownFanOverlay cooldown={props.cooldown} maxCooldown={props.maxCooldown} />
      )}
      {!isEmpty && props.count !== undefined && props.count !== 0 ? (
        <div className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1.5 text-xs font-bold leading-4 text-white">
          {Math.trunc(props.count)}
        </div>
      ) : null}
    </div>
  )
}

function ItemGrid3x3(props: { slots: ItemSlot[] }) {
  const byKey = new Map(props.slots.map((s) => [s.slotKey, s]))
  const ordered = Array.from({ length: 9 }, (_, i) => {
    const k = `slot${i}`
    return byKey.get(k) ?? { slotKey: k, name: undefined, cooldown: undefined }
  })

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {ordered.map((slot) => (
        <div
          key={slot.slotKey}
          className={`${Number(slot.slotKey.replace('slot', '')) >= 6 ? 'h-[34px]' : 'h-9'} w-12`}
        >
          <ItemIcon
            name={slot.name}
            cooldown={slot.cooldown}
            grayscale={Number(slot.slotKey.replace('slot', '')) >= 6}
            count={(slot as any).charges}
          />
        </div>
      ))}
    </div>
  )
}

function NeutralCraftingIcons(props: { neutralCrafting: NeutralCraftingSelection; mirrored?: boolean }) {
  const nc = props.neutralCrafting
  const flexDir = props.mirrored ? 'flex-row-reverse' : 'flex-row'
  
  if (!nc) {
    return (
      <div className={`flex ${flexDir} gap-1`}>
        <div className="h-9 w-9 rounded-full bg-slate-700" />
        <div className="h-9 w-9 rounded-full bg-slate-700" />
      </div>
    )
  }

  const trinketQuery = useItemImageUrl(nc.trinket.name)
  const enchantQuery = useItemImageUrl(nc.enchantment.name)
  const trinketUrl = trinketQuery.data ?? undefined
  const enchantUrl = enchantQuery.data ?? undefined

  return (
    <div className={`flex ${flexDir} gap-1`}>
      {/* Trinket (has CD) */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-700">
        {trinketUrl ? (
          <img className="h-full w-full object-cover" src={trinketUrl} alt="Trinket" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">T</div>
        )}
        <CooldownFanOverlay cooldown={nc.trinket.cooldown} maxCooldown={nc.trinket.maxCooldown} />
        {nc.trinket.charges !== undefined && nc.trinket.charges !== 0 ? (
          <div className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1.5 text-xs font-bold leading-4 text-white">
            {Math.trunc(nc.trinket.charges)}
          </div>
        ) : null}
      </div>
      {/* Enchantment (passive) */}
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-slate-700">
        {enchantUrl ? (
          <img className="h-full w-full object-cover" src={enchantUrl} alt="Enchant" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">E</div>
        )}
        {nc.enchantment && (nc.enchantment as any).charges !== undefined && (nc.enchantment as any).charges !== 0 ? (
          <div className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1.5 text-xs font-bold leading-4 text-white">
            {Math.trunc((nc.enchantment as any).charges)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------- Main PlayerCard ----------

export function PlayerCard(props: { player: PlayerData; mirrored?: boolean }) {
  const { player, mirrored = false } = props
  const teleport = player.teleports[0]

  // For mirrored (Dire side), we reverse the flex direction
  const flexDir = mirrored ? 'flex-row-reverse' : 'flex-row'

  return (
    <div className={`flex ${flexDir} gap-2 rounded bg-slate-800 p-3`}>
      {/* Left: Hero portrait + name */}
      <HeroPortrait
        heroName={player.heroName}
        level={player.level}
        alive={player.alive}
        respawnSeconds={player.respawnSeconds}
        mirrored={mirrored}
      />

      {/* Middle: HP/MP bars + Abilities + TP + Neutral crafting */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {/* HP & MP bars - full width */}
        <div className="flex flex-col gap-0.5">
          <HealthBar current={player.hp} max={player.hpMax} />
          <ManaBar current={player.mana} max={player.manaMax} />
        </div>

        {/* Abilities + spacer + TP + Neutral crafting row */}
        <div className={`flex ${flexDir} items-center gap-1`}>
          <div className={`flex ${mirrored ? 'flex-row-reverse' : 'flex-row'} gap-0.5`}>
            {player.abilities.map((ab) => (
              <AbilityIcon key={ab.abilityKey} ability={ab} />
            ))}
          </div>
          {/* Spacer - one ability slot width */}
          <div className="w-9 shrink-0" aria-hidden="true" />
          {/* TP + Neutral crafting (Trinket + Enchant) */}
          <div className={`flex ${mirrored ? 'flex-row-reverse' : 'flex-row'} items-center gap-1`}>
            <TpIcon teleport={teleport} />
            <NeutralCraftingIcons neutralCrafting={player.neutralCrafting} mirrored={mirrored} />
          </div>
        </div>
      </div>

      {/* Right: Item grid only - no gap */}
      <ItemGrid3x3 slots={player.items} />
    </div>
  )
}
