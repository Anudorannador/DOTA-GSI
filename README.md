# DOTA GSI

## Screenshot

![png](./assets/clipboard_2026-01-09_22-42.png)

## Monorepo containing two projects:

- `dota-gsi-server/`: Rust server that receives Dota 2 Game State Integration (GSI) payloads
- `dota-gsi-web/`: Web UI (Vite + React)

## Dota 2 GSI Config (Linux)

1. Enable GSI: Steam → Library → Dota 2 → Properties → Launch Options, add
   `-gamestateintegration` (Dota only loads GSI configs when launched with it).

2. Put `gamestate_integration_sidecar.cfg` into the `gamestate_integration`
   folder inside your Dota install. Its location depends on how Steam is
   installed:

   - Native Steam:   `~/.steam/steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/`
   - Newer/alt path: `~/.local/share/Steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/`
   - Flatpak Steam:  `~/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/`

   Not sure which one? Find it with:

   ```bash
   find ~ -type d -path '*dota 2 beta/game/dota/cfg' 2>/dev/null
   ```

   Create the `gamestate_integration` subfolder if it is missing. The file name
   must start with `gamestate_integration_`, then restart Dota 2.

Important:

- The `auth.token` in this file must match `GSI_AUTH_TOKEN` used by the server.
- `uri` must point to where this server is reachable. When the game and this
  server run on the same Linux machine, `http://127.0.0.1:3005/` is correct.
  For a separate LAN host, use its IP (e.g. `http://192.168.x.x:3005/`) and
  allow that port through the firewall.

```cfg
"dota2-gsi Configuration"
{
    "uri" "http://127.0.0.1:3005/"
    "timeout" "5.0"
    "buffer" "0.1"
    "throttle" "0.1"
    "heartbeat" "30.0"
    "data"
    {
        "auth"            "1"
        "provider"        "1"
        "map"             "1"
        "player"          "1"
        "hero"            "1"
        "abilities"       "1"
        "items"           "1"
        "events"          "1"
        "buildings"       "1"
        "league"          "1"
        "draft"           "1"
        "wearables"       "1"
        "minimap"         "1"
        "roshan"          "1"
        "couriers"        "1"
        "neutralitems"    "1"
    }
    "auth"
    {
        "token" "90dc54f02b802214408c6620e6052ad7cb1a39ceeeb4ac5c8b40a8e13b9516dd"
    }
}
```

## Patch compatibility (Dota 2 7.41)

- **Facets were removed from the game in 7.41.** The dashboard never
  rendered facets, so nothing changes; the GSI still emits a vestigial
  `hero.facet` field (always `0`), which is ignored.
- **Neutral items** still use the Madstone crafting system. Since 7.41,
  Enchantment options depend on the hero's primary attribute (no longer random)
  and tiers 2-5 offer 5 choices instead of 4. The crafted result is still one
  Artifact + one Enchantment, which the dashboard reads from the
  `neutralitems` block (keep `"neutralitems" "1"` in the config above).

## License

MIT. See `LICENSE`.
