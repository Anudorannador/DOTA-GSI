# DOTA GSI

## Screenshot

![png](./assets/clipboard_2026-01-09_22-42.png)

## Monorepo containing two projects:

- `dota-gsi-server/`: Rust server that receives Dota 2 Game State Integration (GSI) payloads
- `dota-gsi-web/`: Web UI (Vite + React)

## Dota 2 GSI Config

Put this file into your Dota 2 GSI config folder (commonly something like):

- Windows: `...\Steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\`
- Linux/Proton: inside the same `dota/cfg/gamestate_integration/` folder under your Dota installation

File name example: `gamestate_integration_sidecar.cfg`

Important:

- The `auth.token` in this file must match `GSI_AUTH_TOKEN` used by the server.
- `uri` must point to where this server is reachable.

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

## License

MIT. See `LICENSE`.
