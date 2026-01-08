import { useSmoothedCooldown } from '../hooks/useSmoothedCooldown'
import { formatItemFallbackLabel, useItemImageUrl } from '../hooks/useItemImageUrl'
import { CooldownFanOverlay } from './CooldownFanOverlay'

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

export type NeutralCraftingSelection =
  | {
      tierKey: string
      enchantment: { name: string }
      trinket: SpecialItem
    }
  | null

function CooldownText(props: { cooldown: number | undefined }) {
  const cd0 = typeof props.cooldown === 'number' && Number.isFinite(props.cooldown) ? props.cooldown : 0
  const cd = useSmoothedCooldown(cd0 > 0 ? cd0 : 0)
  if (cd <= 0) return null
  return <div className="text-[10px] font-semibold text-slate-800">{Math.ceil(cd)}</div>
}

function SpecialTextCell(props: { item: SpecialItem | undefined }) {
  const name = props.item?.name
  const hasName = typeof name === 'string' && name.length > 0

  // If absent, render an empty placeholder cell.
  if (!hasName) {
    return <div className="h-full w-full bg-slate-100" />
  }

  return (
    <div className="flex h-full w-full flex-col justify-center bg-slate-100 px-1">
      <div className="truncate text-[10px] font-medium text-slate-700">{name}</div>
      <CooldownText cooldown={props.item?.cooldown} />
      {/* maxCooldown is available but not displayed yet */}
    </div>
  )
}

function TeleportIconCell(props: { item: SpecialItem | undefined }) {
  const name = props.item?.name
  const isEmpty = !name || name === 'empty'

  // Teleport slot is always represented by the TP scroll icon.
  const imageQuery = useItemImageUrl('item_tpscroll')
  const url = imageQuery.data ?? undefined

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      {url ? (
        <img
          className={`h-full w-full object-cover ${isEmpty ? 'grayscale opacity-40' : ''}`}
          src={url}
          alt={isEmpty ? 'teleport (empty)' : name}
          loading="lazy"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium leading-tight text-slate-600 ${
            isEmpty ? 'opacity-40' : ''
          }`}
        >
          TP
        </div>
      )}
      {!isEmpty && <CooldownFanOverlay cooldown={props.item?.cooldown} maxCooldown={props.item?.maxCooldown} />}
    </div>
  )
}

function ItemIconCell(props: { slot: ItemSlot }) {
  const name = props.slot.name
  const isEmpty = !name || name === 'empty'

  const imageQuery = useItemImageUrl(isEmpty ? undefined : name)
  const url = imageQuery.data ?? undefined

  if (isEmpty) return <div className="h-full w-full bg-slate-100" />

  return (
    <div className="h-full w-full overflow-hidden bg-slate-100">
      {url ? (
        <img className="h-full w-full object-cover" src={url} alt={name} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium leading-tight text-slate-600">
          {formatItemFallbackLabel(name)}
        </div>
      )}
    </div>
  )
}

function SimpleItemIconCell(props: {
  itemName: string | undefined
  cooldown?: number | undefined
  maxCooldown?: number | undefined
}) {
  const name = props.itemName
  const isEmpty = !name || name === 'empty'

  const imageQuery = useItemImageUrl(isEmpty ? undefined : name)
  const url = imageQuery.data ?? undefined

  if (isEmpty) return <div className="h-full w-full bg-slate-100" />

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      {url ? (
        <img className="h-full w-full object-cover" src={url} alt={name} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium leading-tight text-slate-600">
          {formatItemFallbackLabel(name)}
        </div>
      )}
      <CooldownFanOverlay cooldown={props.cooldown} maxCooldown={props.maxCooldown} />
    </div>
  )
}

export function ItemsPanel(props: {
  slots: ItemSlot[]
  teleports: SpecialItem[]
  neutrals: SpecialItem[]
  neutralCrafting: NeutralCraftingSelection
}) {
  const byKey = new Map(props.slots.map((s) => [s.slotKey, s]))
  const items = Array.from({ length: 9 }, (_, i) => {
    const k = `slot${i}`
    return (
      byKey.get(k) ?? {
        slotKey: k,
        name: undefined,
        cooldown: undefined,
      }
    )
  })

  const teleports = props.teleports.slice(0, 3)
  const neutrals = props.neutrals.slice(0, 3)

  const craftingEnchantmentName = props.neutralCrafting?.enchantment?.name
  const craftingTrinket = props.neutralCrafting?.trinket

  // Desired layout (3 rows x 6 cols):
  // slot0 slot1 slot2 tp0 tp1 tp2
  // slot3 slot4 slot5 n0  n1  n2
  // slot6 slot7 slot8 -   -   -
  const cells: Array<
    | { kind: 'item'; slot: ItemSlot }
    | { kind: 'teleport'; item?: SpecialItem }
    | { kind: 'neutral'; item?: SpecialItem }
    | { kind: 'neutralCraftingEnch' }
    | { kind: 'neutralCraftingTrinket' }
    | { kind: 'empty' }
  > = []

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      cells.push({ kind: 'item', slot: items[r * 3 + c] })
    }

    if (r === 0) {
      for (let i = 0; i < 3; i++) cells.push({ kind: 'teleport', item: teleports[i] })
    } else if (r === 1) {
      for (let i = 0; i < 3; i++) cells.push({ kind: 'neutral', item: neutrals[i] })
    } else {
      cells.push({ kind: 'neutralCraftingEnch' })
      cells.push({ kind: 'neutralCraftingTrinket' })
      cells.push({ kind: 'empty' })
    }
  }

  // Slight spacing between cells; keep row/col gaps small and consistent.
  // Item icons are smaller than hero portraits.
  return (
    <div className="grid grid-cols-6 gap-0.5">
      {cells.map((cell, idx) => (
        <div key={idx} className="w-12 aspect-[88/64]">
          {cell.kind === 'item' ? (
            <ItemIconCell slot={cell.slot} />
          ) : cell.kind === 'teleport' ? (
            <TeleportIconCell item={cell.item} />
          ) : cell.kind === 'neutral' ? (
            <SpecialTextCell item={cell.item} />
          ) : cell.kind === 'neutralCraftingEnch' ? (
            <SimpleItemIconCell itemName={craftingEnchantmentName} />
          ) : cell.kind === 'neutralCraftingTrinket' ? (
            <SimpleItemIconCell
              itemName={craftingTrinket?.name}
              cooldown={craftingTrinket?.cooldown}
              maxCooldown={craftingTrinket?.maxCooldown}
            />
          ) : (
            <div className="h-full w-full bg-slate-100" />
          )}
        </div>
      ))}
    </div>
  )
}
