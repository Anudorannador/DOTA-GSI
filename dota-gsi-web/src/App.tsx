import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog } from '@radix-ui/themes'
import { z } from 'zod'
import { PlayerCard } from './components/PlayerCard'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNumberSuffix(key: string): number | undefined {
  const m = key.match(/(\d+)$/)
  return m ? Number(m[1]) : undefined
}

function sortByNumberSuffix(a: string, b: string): number {
  const an = getNumberSuffix(a)
  const bn = getNumberSuffix(b)
  if (an === undefined && bn === undefined) return a.localeCompare(b)
  if (an === undefined) return 1
  if (bn === undefined) return -1
  return an - bn
}

function isTeamKey(key: string): boolean {
  return /^team\d+$/.test(key)
}

const WS_URL_STORAGE_KEY = 'dota-gsi-web.ws-url'
const DEFAULT_WS_URL_INPUT = 'ws://localhost:3005'

const wsUrlSchema = z.string().trim().superRefine((val, ctx) => {
  let url: URL
  try {
    url = new URL(val)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid URL' })
    return
  }

  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    ctx.addIssue({ code: 'custom', message: 'URL must start with ws:// or wss://' })
  }
  if (!url.hostname) {
    ctx.addIssue({ code: 'custom', message: 'URL must include a hostname' })
  }
})

function getInitialWsUrlInput(): string {
  const stored = window.localStorage.getItem(WS_URL_STORAGE_KEY)
  if (stored && stored.trim().length > 0) return stored
  return DEFAULT_WS_URL_INPUT
}

function normalizeWsUrlForConnection(input: string): string {
  const url = new URL(input.trim())

  // If a user provides only an origin (e.g. ws://localhost:3005), default to the full stream endpoint.
  if (url.pathname === '' || url.pathname === '/') {
    url.pathname = '/ws/full'
  }

  return url.toString()
}

function formatEpochSecondsToLocal(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : String(epochSeconds)
}

function formatDurationSeconds(value: number | undefined): string {
  if (value === undefined) return '-'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(value))
  const minutes = Math.floor(abs / 60)
  const seconds = abs % 60
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asObject(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined
}

function itemCharges(item: JsonObject): number | undefined {
  return asNumber(item.item_charges) ?? asNumber(item.charges)
}

function shouldHideAbilityName(name: string): boolean {
  return name.startsWith('seasonal_') || name === 'plus_high_five' || name === 'plus_guild_banner'
}

function pickTeamKeys(payload: JsonObject): string[] {
  const hero = payload.hero
  if (!isObject(hero)) return []
  const keys = Object.keys(hero).filter(isTeamKey)
  keys.sort(sortByNumberSuffix)
  return keys
}

function getTeamLabel(payload: JsonObject, teamKey: string): string | undefined {
  const playerRoot = asObject(payload.player)

  const teamRoot = asObject(playerRoot?.[teamKey])
  if (teamRoot) {
    const playerKeys = Object.keys(teamRoot).sort(sortByNumberSuffix)
    const firstPlayer = asObject(playerKeys[0] ? teamRoot[playerKeys[0]] : undefined)
    const teamName = firstPlayer ? asString(firstPlayer.team_name) : undefined
    if (teamName) return teamName
  }

  return playerRoot ? asString(playerRoot.team_name) : undefined
}

function getTeamView(payload: JsonObject, teamKey: string) {
  const heroRoot = asObject(payload.hero)
  const itemsRoot = asObject(payload.items)
  const abilitiesRoot = asObject(payload.abilities)
  const neutralitemsRoot = asObject(payload.neutralitems)

  const heroTeam = asObject(heroRoot?.[teamKey])
  const itemsTeam = asObject(itemsRoot?.[teamKey])
  const abilitiesTeam = asObject(abilitiesRoot?.[teamKey])
  const neutralitemsTeam = asObject(neutralitemsRoot?.[teamKey])

  const pickNeutralCraftingSelection = (playerKey: string) => {
    const playerObj = asObject(neutralitemsTeam?.[playerKey])
    if (!playerObj) return null

    const tierKeys = Object.keys(playerObj).filter((k) => /^tier\d+$/.test(k))
    tierKeys.sort((a, b) => sortByNumberSuffix(b, a))

    const pickSelected = (choices: JsonObject | undefined) => {
      if (!choices) return null
      const choiceKeys = Object.keys(choices).filter((k) => k.startsWith('choice'))
      if (choiceKeys.length === 0) return null

      for (const k of choiceKeys) {
        const c = asObject(choices[k])
        if (!c) continue
        const selected = c.selected
        if (selected !== true) continue
        const itemName = asString(c.item_name)
        if (!itemName) continue
        const cooldown = asNumber(c.cooldown)
        const maxCooldown = asNumber(c.max_cooldown)
        return { itemName, cooldown, maxCooldown }
      }

      return null
    }

    for (const tierKey of tierKeys) {
      const tierObj = asObject(playerObj[tierKey])
      if (!tierObj) continue

      // The GSI still calls the active component "trinket"; in-game (since 7.38)
      // it is the "Artifact", so we expose it under that name.
      const enchantChoices = asObject(tierObj.enchantment_choices)
      const artifactChoices = asObject(tierObj.trinket_choices)

      const selectedEnch = pickSelected(enchantChoices)
      const selectedArtifact = pickSelected(artifactChoices)

      // A crafted tier always pairs one Enchantment with one Artifact.
      if (!selectedEnch || !selectedArtifact) continue

      return {
        tierKey,
        enchantment: { name: selectedEnch.itemName },
        artifact: {
          key: `${tierKey}.artifact`,
          name: selectedArtifact.itemName,
          cooldown: selectedArtifact.cooldown,
          maxCooldown: selectedArtifact.maxCooldown,
        },
      }
    }

    return null
  }

  const pickSpecialItems = (itemsPlayer: JsonObject | undefined, prefix: 'teleport' | 'neutral') => {
    if (!itemsPlayer) return [] as Array<{ key: string; name: string | undefined; cooldown: number | undefined; maxCooldown: number | undefined }>
    const keys = Object.keys(itemsPlayer)
      .filter((k) => k.startsWith(prefix))
      .sort(sortByNumberSuffix)

    return keys
      .map((key) => {
        const v = asObject(itemsPlayer[key])
        const name = v ? asString(v.name) : undefined
        const cooldown = v ? asNumber(v.cooldown) : undefined
        const maxCooldown = v ? asNumber(v.max_cooldown) : undefined
        const charges = v ? itemCharges(v) : undefined
        return { key, name, cooldown, maxCooldown, charges }
      })
      .slice(0, 3)
  }

  const pickTeleport0 = (itemsPlayer: JsonObject | undefined) => {
    const one = pickSpecialItems(itemsPlayer, 'teleport')[0]
    if (!one) return []
    if (one.key !== 'teleport0') return []
    if (one.name === 'empty') return []
    return [one]
  }

  const playerKeys = heroTeam ? Object.keys(heroTeam).sort(sortByNumberSuffix) : []

  const players = playerKeys
    .map((playerKey) => {
      const hero = asObject(heroTeam?.[playerKey])
      const heroName = hero ? asString(hero.name) : undefined
      const hp = hero ? asNumber(hero.health) : undefined
      const hpMax = hero ? asNumber(hero.max_health) : undefined
      const level = hero ? asNumber(hero.level) : undefined
      const mana = hero ? asNumber(hero.mana) : undefined
      const manaMax = hero ? asNumber(hero.max_mana) : undefined
      const alive = asBoolean(hero?.alive)
      const respawnSeconds = asNumber(hero?.respawn_seconds)

      // hero.talent_1..talent_8 booleans (index 0 = talent_1).
      const talents = Array.from({ length: 8 }, (_, i) => asBoolean(hero?.[`talent_${i + 1}`]) ?? false)
      const aghanimsScepter = asBoolean(hero?.aghanims_scepter) ?? false
      const aghanimsShard = asBoolean(hero?.aghanims_shard) ?? false

      const itemsPlayer = asObject(itemsTeam?.[playerKey])
      const items = Array.from({ length: 9 }, (_, i) => {
        const slotKey = `slot${i}`
        const slot = asObject(itemsPlayer?.[slotKey])
        const name = slot ? asString(slot.name) : undefined
        const cooldown = slot ? asNumber(slot.cooldown) : undefined
        const charges = slot ? itemCharges(slot) : undefined
        return { slotKey, name, cooldown, charges }
      })

      const teleports = pickTeleport0(itemsPlayer)

      const abilitiesPlayer = asObject(abilitiesTeam?.[playerKey])
      const abilityKeys = abilitiesPlayer
        ? Object.keys(abilitiesPlayer).filter((k) => k.startsWith('ability'))
        : []
      abilityKeys.sort(sortByNumberSuffix)
      const abilities = abilityKeys
        .map((abilityKey) => {
          const ab = asObject(abilitiesPlayer?.[abilityKey])
          const name = ab ? asString(ab.name) : undefined
          const cooldown = ab ? asNumber(ab.cooldown) : undefined
          const maxCooldown = ab ? asNumber(ab.max_cooldown) : undefined
          const passive = asBoolean(ab?.passive)
          return { abilityKey, name, cooldown, maxCooldown, passive }
        })
        .filter(
          (x): x is {
            abilityKey: string
            name: string
            cooldown: number | undefined
            maxCooldown: number | undefined
            passive: boolean | undefined
          } => {
            return Boolean(x.name) && !shouldHideAbilityName(x.name!)
          },
        )

      return {
        playerKey,
        heroName,
        level,
        hp,
        hpMax,
        mana,
        manaMax,
        alive,
        respawnSeconds,
        items,
        teleports,
        neutralCrafting: pickNeutralCraftingSelection(playerKey),
        abilities,
        talents,
        aghanimsScepter,
        aghanimsShard,
      }
    })
    .filter((p) => p.heroName)

  const teamLabelRaw = getTeamLabel(payload, teamKey)
  const teamLabel = teamLabelRaw ? teamLabelRaw.toUpperCase() : undefined

  return { teamKey, teamLabel: teamLabel ?? teamKey, players }
}

function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    const request = async () => {
      if (disposed) return
      if (!('wakeLock' in navigator)) return

      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Best-effort: some browsers require user gesture or don't support it.
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void request()
      }
    }

    void request()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}

function App() {
  const [payload, setPayload] = useState<JsonObject | null>(null)
  const [lastLocalUpdateMs, setLastLocalUpdateMs] = useState<number | null>(null)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [reconnectInSec, setReconnectInSec] = useState<number | null>(null)
  const hasEverConnectedRef = useRef(false)
  const [wsUrlInput, setWsUrlInput] = useState<string>(() => getInitialWsUrlInput())
  const [wsConfigOpen, setWsConfigOpen] = useState(false)

  // Keep the screen awake while this dashboard is open (supported browsers only).
  useScreenWakeLock(true)

  const wsUrlParse = useMemo(() => wsUrlSchema.safeParse(wsUrlInput), [wsUrlInput])
  const wsUrl = useMemo(() => {
    // If invalid, keep trying to connect to the last saved value (or default).
    // This keeps the dashboard working while the user edits.
    const parsed = wsUrlParse.success ? wsUrlParse.data : getInitialWsUrlInput()
    return normalizeWsUrlForConnection(parsed)
  }, [wsUrlParse])

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let reconnectTimer: number | undefined
    let countdownTimer: number | undefined

    const clearTimers = () => {
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
      if (countdownTimer !== undefined) window.clearInterval(countdownTimer)
      reconnectTimer = undefined
      countdownTimer = undefined
    }

    const connectNow = () => {
      clearTimers()
      setReconnectInSec(null)
      setWsStatus('connecting')
      ws = new WebSocket(wsUrl)
      ws.onopen = () => {
        hasEverConnectedRef.current = true
        setReconnectInSec(null)
        setWsStatus('connected')
      }
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data))
          if (isObject(data)) {
            setPayload(data)
            setLastLocalUpdateMs(Date.now())
          }
        } catch {
          // ignore malformed frames
        }
      }
      ws.onclose = () => {
        setWsStatus('disconnected')
        setReconnectInSec(null)
        if (closed) return
        // Reconnect with a countdown to avoid flapping.
        startReconnectCountdown(3)
      }
    }

    const startReconnectCountdown = (seconds: number) => {
      clearTimers()
      setWsStatus('connecting')

      let remaining = Math.max(0, Math.trunc(seconds))
      setReconnectInSec(remaining)

      countdownTimer = window.setInterval(() => {
        if (closed) {
          clearTimers()
          return
        }

        remaining -= 1
        if (remaining > 0) {
          setReconnectInSec(remaining)
          return
        }

        clearTimers()
        connectNow()
      }, 1000)
    }

    const connect = () => {
      // If we've connected before, treat subsequent connects as reconnects.
      if (hasEverConnectedRef.current) {
        startReconnectCountdown(3)
        return
      }
      connectNow()
    }

    connect()

    return () => {
      closed = true
      clearTimers()
      ws?.close()
    }
  }, [wsUrl])

  const wsUrlError = useMemo(() => {
    if (wsUrlParse.success) return null
    const msg = wsUrlParse.error.issues[0]?.message
    return msg ?? 'Invalid URL'
  }, [wsUrlParse])

  const saveWsUrl = () => {
    if (!wsUrlParse.success) return
    const next = wsUrlParse.data
    window.localStorage.setItem(WS_URL_STORAGE_KEY, next)
    setWsUrlInput(next)
    setWsConfigOpen(false)
  }

  const teams = useMemo(() => {
    if (!payload) return []
    return pickTeamKeys(payload)
  }, [payload])

  const teamViews = useMemo(() => {
    if (!payload) return []
    return teams.map((t) => getTeamView(payload, t))
  }, [payload, teams])

  const headerTimes = useMemo(() => {
    if (!payload) return null

    const map = asObject(payload.map)
    const provider = asObject(payload.provider)

    const clockTime = map ? asNumber(map.clock_time) : undefined
    const gameTime = map ? asNumber(map.game_time) : undefined
    const matchTime = clockTime ?? gameTime

    const daytime = asBoolean(map?.daytime)
    const nightstalkerNight = asBoolean(map?.nightstalker_night)

    const providerTs = provider ? asNumber(provider.timestamp) : undefined
    const providerLocal = providerTs !== undefined ? formatEpochSecondsToLocal(providerTs) : undefined
    const localReceive =
      lastLocalUpdateMs !== null ? new Date(lastLocalUpdateMs).toLocaleString() : undefined

    return {
      matchTime,
      daytime,
      nightstalkerNight,
      providerLocal,
      localReceive,
    }
  }, [payload, lastLocalUpdateMs])

  const dayNightIcon = useMemo(() => {
    if (!headerTimes) return null

    // Do NOT infer from time; trust the server-provided flags.
    const isNight = headerTimes.nightstalkerNight === true ? true : headerTimes.daytime === false
    const url = isNight
      ? 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f319.svg'
      : 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2600.svg'
    const alt = isNight ? 'Night' : 'Day'

    return { url, alt }
  }, [headerTimes])

  return (
    <div className="min-h-screen min-w-[1500px] bg-slate-900 p-8 text-white">
      {/* Compact header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">DOTA GSI</h1>
          {/* WebSocket status indicator */}
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${
              wsStatus === 'connected'
                ? 'bg-green-900/50 text-green-400'
                : wsStatus === 'connecting' || reconnectInSec !== null
                  ? 'bg-yellow-900/50 text-yellow-400'
                  : 'bg-red-900/50 text-red-400'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-green-400'
                  : wsStatus === 'connecting' || reconnectInSec !== null
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-400'
              }`}
            />
            {wsStatus === 'connected'
              ? 'Live'
              : reconnectInSec !== null
                ? `Reconnecting in ${reconnectInSec}s`
                : wsStatus === 'connecting'
                  ? 'Connecting'
                  : 'Offline'}
          </span>

          <Dialog.Root open={wsConfigOpen} onOpenChange={setWsConfigOpen}>
            <Dialog.Trigger>
              <Button size="1" variant="soft">WS</Button>
            </Dialog.Trigger>
            <Dialog.Content maxWidth="520px">
              <Dialog.Title>WebSocket URL</Dialog.Title>
              <Dialog.Description>
                Set the WebSocket base URL (e.g. <span className="font-mono">ws://localhost:3005</span>) or a full endpoint
                (e.g. <span className="font-mono">ws://localhost:3005/ws/full</span>). This is saved locally and takes effect immediately.
              </Dialog.Description>

              <div className="mt-4">
                <label className="block text-sm text-slate-300">URL</label>
                <input
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-slate-500"
                  value={wsUrlInput}
                  onChange={(e) => setWsUrlInput(e.target.value)}
                  placeholder={DEFAULT_WS_URL_INPUT}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {wsUrlError ? <div className="mt-2 text-sm text-red-400">{wsUrlError}</div> : null}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Dialog.Close>
                  <Button variant="soft">Cancel</Button>
                </Dialog.Close>
                <Button onClick={saveWsUrl} disabled={!wsUrlParse.success}>
                  Save & Reconnect
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Root>
        </div>
        {headerTimes && (
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1">
              {dayNightIcon ? (
                <img className="h-4 w-4" src={dayNightIcon.url} alt={dayNightIcon.alt} loading="lazy" />
              ) : (
                <span aria-hidden="true">⏱</span>
              )}
              {formatDurationSeconds(headerTimes.matchTime)}
            </span>
            <span>
              🌍{' '}
              {headerTimes.providerLocal
                ? headerTimes.providerLocal
                : headerTimes.localReceive
                  ? headerTimes.localReceive
                  : '-'}
            </span>
          </div>
        )}
      </div>

      {!payload ? (
        <div className="flex h-64 items-center justify-center text-slate-500">Waiting for data…</div>
      ) : (
        <div className="flex h-[calc(100vh-52px)]">
          {/* Two-column layout: Radiant (left) | Dire (right) */}
          {teamViews.map((team, teamIndex) => {
            const isRadiant = teamIndex === 0
            const mirrored = !isRadiant

            return (
              <div
                key={team.teamKey}
                className={`flex w-1/2 flex-col border-slate-700 ${isRadiant ? 'border-r' : ''}`}
              >
                {/* Team header */}
                <div
                  className={`border-b border-slate-700 px-4 py-1 text-sm font-medium ${
                    isRadiant ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                  }`}
                >
                  {team.teamLabel}
                </div>

                {/* Players list */}
                <div className="flex flex-col gap-1 p-2">
                  {team.players.map((p) => (
                    <PlayerCard
                      key={p.playerKey}
                      player={{
                        playerKey: p.playerKey,
                        heroName: p.heroName!,
                        level: p.level,
                        hp: p.hp,
                        hpMax: p.hpMax,
                        mana: p.mana,
                        manaMax: p.manaMax,
                        alive: p.alive,
                        respawnSeconds: p.respawnSeconds,
                        items: p.items,
                        teleports: p.teleports,
                        neutralCrafting: p.neutralCrafting,
                        abilities: p.abilities,
                        talents: p.talents,
                        aghanimsScepter: p.aghanimsScepter,
                        aghanimsShard: p.aghanimsShard,
                      }}
                      mirrored={mirrored}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default App
