import { formatItemFallbackLabel, useItemImageUrl } from '../hooks/useItemImageUrl'

type ItemSlot = {
  slotKey: string
  name: string | undefined
  cooldown: number | undefined
}

function ItemSlotCell(props: { slot: ItemSlot }) {
  const name = props.slot.name
  const isEmpty = !name || name === 'empty'

  const imageQuery = useItemImageUrl(isEmpty ? undefined : name)
  const url = imageQuery.data ?? undefined

  return (
    <div className="h-full w-full overflow-hidden bg-slate-100">
      {isEmpty ? null : url ? (
        <img className="h-full w-full object-cover" src={url} alt={name} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-medium leading-tight text-slate-600">
          {formatItemFallbackLabel(name)}
        </div>
      )}
    </div>
  )
}

export function ItemGrid(props: { slots: ItemSlot[] }) {
  // Expect slot0..slot8. If data is missing, still render 9 cells.
  const byKey = new Map(props.slots.map((s) => [s.slotKey, s]))
  const ordered = Array.from({ length: 9 }, (_, i) => {
    const k = `slot${i}`
    return (
      byKey.get(k) ?? {
        slotKey: k,
        name: undefined,
        cooldown: undefined,
      }
    )
  })

  // Dota item icons are 88x64 (~1.375). Use that ratio.
  return (
    <div className="inline-grid grid-cols-3 gap-x-0.5 gap-y-0.5">
      {ordered.map((slot) => (
        <div key={slot.slotKey} className="w-12 aspect-[88/64]">
          <ItemSlotCell slot={slot} />
        </div>
      ))}
    </div>
  )
}
