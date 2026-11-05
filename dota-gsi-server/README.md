# dota-gsi-server (Rust)

Lightweight Dota 2 Game State Integration (GSI) HTTP receiver.

It accepts `POST /` payloads from Dota 2, performs auth + dedup, broadcasts to WebSocket clients, and optionally publishes the payload JSON to Redis Pub/Sub. The `auth` block is removed before anything is stored or sent on.

`GET /state` and the websocket routes do not check the token. Point them only at a network you trust.

## Endpoints

- `POST /` ingest Dota 2 GSI payload (auth token check + dedup). Body is `processed` or `duplicate`.
- `GET /state` returns the latest payload (if any), without `auth`
- `GET /health` health check
- WebSocket:
  - `GET /ws/full` streams full payload JSON
  - `GET /ws/updates` streams `{added, previously}` deltas when present

## Quick Start

From this folder:

```bash
cargo run -- \
  --http-host 0.0.0.0 --http-port 3005 \
  --gsi-auth-token YOUR_PRIVATE_TOKEN
```

Replace `YOUR_PRIVATE_TOKEN` with a private string and use the same value in the cfg file. The server exits if the token is missing, `YOUR_PRIVATE_TOKEN`, or `CHANGE_ME_TO_A_RANDOM_SECRET`.

Environment variables are supported as defaults (loaded from `.env` via `dotenvy`).

## Redis Publish (Optional)

Redis publish is OFF by default.

To enable it, provide `REDIS_URL` (supports username/password):

```bash
# Enable via env
REDIS_URL="redis://user:pass@localhost:6379" cargo run --

# Enable via CLI
cargo run -- --redis-url "redis://user:pass@localhost:6379"
```

By default the server publishes the payload JSON (without `auth`) to `REDIS_CHANNEL` (default: `dota2:gsi:live`).

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
- `GSI_AUTH_TOKEN` (required; the public default is refused)
- `SOURCE` (default: `win-gaming-pc`)
- `REDIS_URL` (optional; enables publish)
- `REDIS_CHANNEL` (default: `dota2:gsi:live`)
- `RAW_DATA_DIR` (default: `./raw`)
- `RAW_MAX_MB` (default: `100`)

If you use `.env`, see `.env` in this folder for a template.
