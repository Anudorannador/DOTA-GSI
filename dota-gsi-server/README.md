# dota-gsi-server (Rust)

Lightweight Dota 2 Game State Integration (GSI) HTTP receiver.

It accepts `POST /` payloads from Dota 2, performs auth + dedup, broadcasts to WebSocket clients, and optionally publishes the raw payload JSON to Redis Pub/Sub.

## Endpoints

- `POST /` ingest Dota 2 GSI payload (auth token check + dedup)
- `GET /state` returns the latest payload (if any)
- `GET /health` health check
- WebSocket:
  - `GET /ws/full` streams full payload JSON
  - `GET /ws/updates` streams `{added, previously}` deltas when present

## Quick Start

From this folder:

```bash
cargo run -- \
  --http-host 0.0.0.0 --http-port 3005 \
  --gsi-auth-token CHANGE_ME_TO_A_RANDOM_SECRET
```

Environment variables are supported as defaults (loaded from `.env` via `dotenvy`).

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

## Redis Publish (Optional)

Redis publish is OFF by default.

To enable it, provide `REDIS_URL` (supports username/password):

```bash
# Enable via env
REDIS_URL="redis://user:pass@localhost:6379" cargo run --

# Enable via CLI
cargo run -- --redis-url "redis://user:pass@localhost:6379"
```

By default the server publishes the raw payload JSON to `REDIS_CHANNEL` (default: `dota2:gsi:live`).

## Raw JSONL Logging (Optional)

Raw logging is OFF by default.

```bash
# Enable raw JSONL logging (rotates by size)
cargo run -- --raw-log
```

The output directory and rotation size can be configured via:

- `RAW_DATA_DIR` (default: `./raw`)
- `RAW_MAX_MB` (default: `100`)

## Configuration

All options can be provided via CLI flags or environment variables.

- `HTTP_HOST` (default: `0.0.0.0`)
- `HTTP_PORT` (default: `3005`)
- `GSI_AUTH_TOKEN` (default: `CHANGE_ME_TO_A_RANDOM_SECRET`)
- `SOURCE` (default: `win-gaming-pc`)
- `REDIS_URL` (optional; enables publish)
- `REDIS_CHANNEL` (default: `dota2:gsi:live`)
- `RAW_DATA_DIR` (default: `./raw`)
- `RAW_MAX_MB` (default: `100`)

If you use `.env`, see `.env` in this folder for a template.
