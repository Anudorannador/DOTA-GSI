/**
 * Compact player card for the mirrored 5v5 layout.
 * Displays hero portrait, level, HP/MP bars, abilities, TP, items, and neutral crafting.
 */

import { useId } from 'react'
import { useHeroImageUrl } from '../hooks/useHeroImageUrl'
import { useItemImageUrl, formatItemFallbackLabel } from '../hooks/useItemImageUrl'
import { useAbilityImageUrl } from '../hooks/useAbilityImageUrl'
import { formatHeroDisplayName } from '../lib/dotaHero'
import { CooldownFanOverlay } from './CooldownFanOverlay'
import { HealthBar, ManaBar } from './HealthManaBar'

export type ItemSlot = {
  slotKey: string
  name: string | undefined
  cooldown: number | undefined
  charges?: number | undefined
}

export type SpecialItem = {
  key: string
  name: string | undefined
  cooldown: number | undefined
  maxCooldown: number | undefined
  charges?: number | undefined
}

/**
 * The crafted neutral item for a player: a passive Enchantment plus an active
 * Artifact (called "trinket" in older GSI payloads). Since Dota 2 7.41 the
 * Enchantment options depend on the hero's primary attribute, but the crafted
 * result is still one Enchantment + one Artifact, so this shape is unchanged.
 */
export type NeutralCraftingSelection =
  | {
      tierKey: string
      enchantment: { name: string }
      artifact: SpecialItem
    }
  | null

type Ability = {
  abilityKey: string
  name: string
  cooldown: number | undefined
  maxCooldown: number | undefined
  passive: boolean | undefined
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
  neutralCrafting: NeutralCraftingSelection
  abilities: Ability[]
  /** hero.talent_1..talent_8 booleans (index 0 = talent_1). */
  talents: boolean[]
}

// ---------- Sub-components ----------

/** Bottom-right charge/stack count badge shared by item & artifact icons. */
function ChargesBadge(props: { count: number | undefined }) {
  if (props.count === undefined || props.count === 0) return null
  return (
    <div className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1.5 text-xs font-bold leading-4 text-white">
      {Math.trunc(props.count)}
    </div>
  )
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
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
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
      {!isEmpty ? <ChargesBadge count={tp?.charges} /> : null}
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
      {!isEmpty ? <ChargesBadge count={props.count} /> : null}
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
      {ordered.map((slot) => {
        // Slots 6-8 are the backpack: smaller and dimmed.
        const isBackpack = Number(slot.slotKey.replace('slot', '')) >= 6
        return (
          <div key={slot.slotKey} className={`${isBackpack ? 'h-[34px]' : 'h-9'} w-12`}>
            <ItemIcon
              name={slot.name}
              cooldown={slot.cooldown}
              grayscale={isBackpack}
              count={slot.charges}
            />
          </div>
        )
      })}
    </div>
  )
}

function NeutralCraftingIcons(props: { neutralCrafting: NeutralCraftingSelection; mirrored?: boolean }) {
  const nc = props.neutralCrafting
  const flexDir = props.mirrored ? 'flex-row-reverse' : 'flex-row'

  // Hooks must run unconditionally; useItemImageUrl is disabled for undefined names.
  const artifactUrl = useItemImageUrl(nc?.artifact.name).data ?? undefined
  const enchantUrl = useItemImageUrl(nc?.enchantment.name).data ?? undefined

  if (!nc) {
    return (
      <div className={`flex ${flexDir} gap-1`}>
        <div className="h-8 w-8 rounded-full bg-slate-700" />
        <div className="h-8 w-8 rounded-full bg-slate-700" />
      </div>
    )
  }

  return (
    <div className={`flex ${flexDir} gap-1`}>
      {/* Artifact (active component, has a cooldown) */}
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
        {artifactUrl ? (
          <img className="h-full w-full object-cover" src={artifactUrl} alt="Artifact" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">A</div>
        )}
        <CooldownFanOverlay cooldown={nc.artifact.cooldown} maxCooldown={nc.artifact.maxCooldown} />
        <ChargesBadge count={nc.artifact.charges} />
      </div>
      {/* Enchantment (passive stat bonus, no cooldown or charges) */}
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-700">
        {enchantUrl ? (
          <img className="h-full w-full object-cover" src={enchantUrl} alt="Enchant" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">E</div>
        )}
      </div>
    </div>
  )
}

/**
 * Compact talent tree: 4 tiers stacked vertically (lvl 25 on top, lvl 10 at
 * bottom, matching the in-game tree). Each tier has a left + right pill plus a
 * central level node (10/15/20/25). A picked side lights up gold; the level
 * node lights once that tier has any pick.
 *
 * Per Dota rules a tier normally has only one side picked, but at levels 26-30
 * the other side gets backfilled (lvl 30 = all gold). Since left/right are
 * independent booleans, both pills simply light when both are true.
 *
 * GSI talent mapping: talent_1/2 = lvl10, 3/4 = lvl15, 5/6 = lvl20, 7/8 = lvl25;
 * odd index = left, even index = right. The tree is NOT mirrored on Dire - only
 * the surrounding layout flips.
 */
function TalentTree(props: { talents: boolean[] }) {
  const t = props.talents
  const at = (i: number) => t[i] === true
  // Top (lvl25) -> bottom (lvl10).
  const tiers = [
    { level: 25, left: at(6), right: at(7) },
    { level: 20, left: at(4), right: at(5) },
    { level: 15, left: at(2), right: at(3) },
    { level: 10, left: at(0), right: at(1) },
  ]

  // Unique gradient/filter ids per instance so multiple trees don't collide.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const goldId = `ttg-${uid}`
  const nodeId = `ttn-${uid}`
  const glowId = `ttglow-${uid}`

  const W = 40
  const H = 70
  const CX = W / 2
  const rowYs = [9, 26, 43, 60] // four tier rows (lvl 25 -> 10)
  const nodeR = 6.5
  const pillW = 12
  const pillH = 9

  return (
    <div className="flex shrink-0 items-stretch" title="Talents (10/15/20/25)">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-10" role="img" aria-label="Talent tree">
        <defs>
          <linearGradient id={goldId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffd668" />
            <stop offset="0.5" stopColor="#f0b73f" />
            <stop offset="1" stopColor="#d6952a" />
          </linearGradient>
          <radialGradient id={nodeId} cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#ffe07a" />
            <stop offset="1" stopColor="#e0a838" />
          </radialGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#ffcf5e" floodOpacity="0.9" />
          </filter>
        </defs>

        {/* central spine */}
        <line
          x1={CX}
          y1={rowYs[0]}
          x2={CX}
          y2={rowYs[rowYs.length - 1]}
          stroke="#475062"
          strokeOpacity={0.5}
          strokeWidth={2.5}
        />

        {tiers.map((tier) => {
          const y = tier.level === 25 ? rowYs[0] : tier.level === 20 ? rowYs[1] : tier.level === 15 ? rowYs[2] : rowYs[3]
          const active = tier.left || tier.right
          const rx = W - pillW
          return (
            <g key={tier.level}>
              {/* connectors center <-> pills */}
              <line x1={pillW} y1={y} x2={CX - nodeR} y2={y} stroke="#475062" strokeOpacity={0.5} strokeWidth={1.5} />
              <line x1={CX + nodeR} y1={y} x2={rx} y2={y} stroke="#475062" strokeOpacity={0.5} strokeWidth={1.5} />
              {/* left pill */}
              <rect
                x={0}
                y={y - pillH / 2}
                width={pillW}
                height={pillH}
                rx={2.5}
                fill={tier.left ? `url(#${goldId})` : '#232b3a'}
                stroke={tier.left ? '#ffe6a3' : '#3c4658'}
                strokeWidth={1}
                filter={tier.left ? `url(#${glowId})` : undefined}
              />
              {/* right pill */}
              <rect
                x={rx}
                y={y - pillH / 2}
                width={pillW}
                height={pillH}
                rx={2.5}
                fill={tier.right ? `url(#${goldId})` : '#232b3a'}
                stroke={tier.right ? '#ffe6a3' : '#3c4658'}
                strokeWidth={1}
                filter={tier.right ? `url(#${glowId})` : undefined}
              />
              {/* central level node */}
              <circle
                cx={CX}
                cy={y}
                r={nodeR}
                fill={active ? `url(#${nodeId})` : '#1b2230'}
                stroke={active ? '#ffe6a3' : '#56627a'}
                strokeWidth={1}
              />
              <text
                x={CX}
                y={y + 2.6}
                textAnchor="middle"
                fontFamily="Arial, sans-serif"
                fontSize={7}
                fontWeight={700}
                fill={active ? '#3a2c08' : '#aab4c6'}
              >
                {tier.level}
              </text>
            </g>
          )
        })}
      </svg>
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

      {/* Middle: HP/MP bars, then a two-row block (skills / TP+neutral) with the
          talent tree below the MP bar hugging the inner side toward the items. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* HP & MP bars - full width */}
        <div className="flex flex-col gap-0.5">
          <HealthBar current={player.hp} max={player.hpMax} />
          <ManaBar current={player.mana} max={player.manaMax} />
        </div>

        {/* Below MP: skills + TP/neutral block, plus the talent tree. justify-between
            keeps the skills toward the portrait and pushes the tree against the item
            grid: left of items (Radiant) / right of items (Dire, via row-reverse). */}
        <div className={`flex ${flexDir} items-stretch justify-between gap-2`}>
          <div className="flex flex-col gap-0.5">
            {/* Row 1: abilities (skills) */}
            <div className={`flex ${mirrored ? 'flex-row-reverse' : 'flex-row'} gap-0.5`}>
              {player.abilities.map((ab) => (
                <AbilityIcon key={ab.abilityKey} ability={ab} />
              ))}
            </div>
            {/* Row 2: TP + Neutral crafting (Artifact + Enchant), directly under the skills */}
            <div className={`flex ${mirrored ? 'flex-row-reverse' : 'flex-row'} items-center gap-1`}>
              <TpIcon teleport={teleport} />
              <NeutralCraftingIcons neutralCrafting={player.neutralCrafting} mirrored={mirrored} />
            </div>
          </div>

          {/* Talent tree - two rows tall, below the MP bar, hugging the items.
              The tree itself is never mirrored; only its position flips. */}
          <TalentTree talents={player.talents} />
        </div>
      </div>

      {/* Right: Item grid only - no gap */}
      <ItemGrid3x3 slots={player.items} />
    </div>
  )
}
